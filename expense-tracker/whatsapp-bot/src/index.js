import pkg from '@whiskeysockets/baileys';
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage,
  fetchLatestBaileysVersion
} = pkg;
import http from 'http';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import { handleMessage } from './handlers/message.js';
import { initDatabase, getDb } from './database.js';

dotenv.config();

// ============================================
// Connection state tracking for health endpoint
// ============================================
let botStatus = 'starting'; // starting | connecting | connected | disconnected | logged_out
let lastStatusChange = new Date().toISOString();

function setStatus(newStatus) {
  botStatus = newStatus;
  lastStatusChange = new Date().toISOString();
  console.log(`📊 Bot status: ${newStatus}`);
}

// ============================================
// HTTP Health Server for Uptime Kuma monitoring
// ============================================
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '3001', 10);

const healthServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const isHealthy = botStatus === 'connected';
    const statusCode = isHealthy ? 200 : 503;
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: botStatus,
      healthy: isHealthy,
      since: lastStatusChange,
      uptime: process.uptime(),
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

healthServer.listen(HEALTH_PORT, () => {
  console.log(`🏥 Health server listening on port ${HEALTH_PORT}`);
});

// ============================================
// SECURITY: Require ALLOWED_NUMBERS configuration
// ============================================
const ALLOWED_NUMBERS = process.env.ALLOWED_NUMBERS?.split(',').map(n => n.trim()).filter(n => n) || [];

if (ALLOWED_NUMBERS.length === 0) {
  console.error('❌ SECURITY ERROR: ALLOWED_NUMBERS environment variable is not set!');
  console.error('');
  console.error('To prevent unauthorized access, you MUST configure allowed phone numbers.');
  console.error('Set ALLOWED_NUMBERS in your .env or docker-compose.yml:');
  console.error('');
  console.error('  ALLOWED_NUMBERS=6281234567890,6289876543210');
  console.error('');
  console.error('Format: country code + number without + sign, comma-separated');
  console.error('');
  // Don't exit — health server will report unhealthy status
  setStatus('config_error');
}

if (ALLOWED_NUMBERS.length > 0) {
  console.log(`🔐 Security: ${ALLOWED_NUMBERS.length} phone number(s) whitelisted`);
}


const logger = pino({ level: 'info' });
let schedulersStarted = false;

function renderTemplate(template, values) {
  return template
    .replaceAll('{user}', values.user || '')
    .replaceAll('{group}', values.group || '')
    .replaceAll('{membercount}', values.membercount || '')
    .replaceAll('{date}', values.date || '');
}

function startSchedulers(sock) {
  if (schedulersStarted) return;
  schedulersStarted = true;
  const db = getDb();

  setInterval(async () => {
    try {
      const polls = db.prepare('SELECT * FROM polls WHERE closed = 0 AND closes_at IS NOT NULL AND closes_at <= ?').all(Date.now());
      for (const poll of polls) {
        const options = JSON.parse(poll.options_json || '[]');
        const votes = Object.values(JSON.parse(poll.votes_json || '{}'));
        const lines = options.map((option, index) => `${index + 1}. ${option} - ${votes.filter((vote) => vote === index).length} vote(s)`);
        db.prepare('UPDATE polls SET closed = 1 WHERE id = ?').run(poll.id);
        await sock.sendMessage(poll.chat_id, { text: `Poll #${poll.id} closed\n${poll.question}\n${lines.join('\n')}` });
      }

      const giveaways = db.prepare('SELECT * FROM giveaways WHERE closed = 0 AND closes_at <= ?').all(Date.now());
      for (const giveaway of giveaways) {
        const participants = JSON.parse(giveaway.participants_json || '[]');
        let winners = [];
        if (participants.length > 0) {
          const shuffled = [...participants];
          for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          winners = shuffled.slice(0, Math.min(giveaway.winner_count, shuffled.length));
        }
        db.prepare('UPDATE giveaways SET closed = 1, winners_json = ? WHERE id = ?').run(JSON.stringify(winners), giveaway.id);
        await sock.sendMessage(giveaway.chat_id, { text: winners.length ? `Giveaway #${giveaway.id} ended\nPrize: ${giveaway.prize}\nWinner(s):\n${winners.join('\n')}` : `Giveaway #${giveaway.id} ended with no entries.` });
      }

      const triviaGames = db.prepare('SELECT * FROM trivia_games WHERE revealed = 0 AND closes_at <= ?').all(Date.now());
      for (const trivia of triviaGames) {
        db.prepare('UPDATE trivia_games SET revealed = 1 WHERE id = ?').run(trivia.id);
        await sock.sendMessage(trivia.chat_id, { text: `Trivia #${trivia.id} answer:\n${trivia.correct_answer}` });
      }
    } catch (error) {
      console.error('Scheduler tick error:', error);
    }
  }, 15_000);

  setInterval(async () => {
    try {
      const today = new Date();
      const key = today.toISOString().slice(0, 10);
      const alreadySent = db.prepare('SELECT id FROM audit_logs WHERE action = ? AND details = ? LIMIT 1').get('birthday_announcement', key);
      if (alreadySent) return;

      const rows = db.prepare(`
        SELECT b.chat_id, b.user_id, b.day, b.month, gs.value AS enabled
        FROM birthdays b
        LEFT JOIN group_settings gs ON gs.chat_id = b.chat_id AND gs.key = 'birthday_announcements'
        WHERE b.day = ? AND b.month = ?
      `).all(today.getDate(), today.getMonth() + 1);

      const grouped = new Map();
      for (const row of rows) {
        if (row.enabled === '0') continue;
        if (!grouped.has(row.chat_id)) grouped.set(row.chat_id, []);
        grouped.get(row.chat_id).push(row.user_id);
      }

      for (const [chatId, users] of grouped.entries()) {
        await sock.sendMessage(chatId, { text: `Today's birthdays:\n${users.join('\n')}\n\nHappy birthday!` });
      }

      if (grouped.size > 0) {
        db.prepare('INSERT INTO audit_logs (chat_id, action, actor_id, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)')
          .run('system', 'birthday_announcement', 'system', null, key, Date.now());
      }
    } catch (error) {
      console.error('Birthday scheduler error:', error);
    }
  }, 60 * 60 * 1000);
}

async function startBot() {
  setStatus('connecting');
  initDatabase();

  console.log('📂 Loading auth state...');
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  console.log('✅ Auth state loaded');

  // Fetch latest WhatsApp version to avoid 405 errors
  console.log('📡 Fetching latest WhatsApp version...');
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`✅ Using WA version: ${version.join('.')}, isLatest: ${isLatest}`);

  const sock = makeWASocket({
    auth: state,
    logger,
    version,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    console.log('🔄 Connection update:', JSON.stringify(update, null, 2));
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });

      // Also save QR as image file for easier access
      try {
        await QRCode.toFile('./auth_info/qr-code.png', qr);
        console.log('📁 QR code also saved to: ./auth_info/qr-code.png');
      } catch (err) {
        console.error('Could not save QR image:', err.message);
      }
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`Connection closed. Status: ${statusCode}, Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setStatus('disconnected');
        setTimeout(() => startBot(), 3000);  // Add delay before reconnect
      } else {
        // Logged out — stay alive so health server can report status
        // and Docker doesn't restart in a loop
        setStatus('logged_out');
        console.log('⚠️ Bot logged out of WhatsApp. Health endpoint will report unhealthy.');
        console.log('⚠️ To re-authenticate, remove auth_info and restart the container.');
      }
    } else if (connection === 'open') {
      setStatus('connected');
      console.log('✅ WhatsApp bot connected!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      try {
        await handleMessage(sock, msg, sock.user?.id);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    }
  });

  sock.ev.on('group-participants.update', async (update) => {
    try {
      if (update.action !== 'add') return;
      const db = getDb();
      const enabled = db.prepare('SELECT value FROM group_settings WHERE chat_id = ? AND key = ?').get(update.id, 'welcome_enabled');
      if (enabled?.value !== '1') return;
      const template = db.prepare('SELECT value FROM group_settings WHERE chat_id = ? AND key = ?').get(update.id, 'welcome_message');
      const metadata = await sock.groupMetadata(update.id);
      for (const participant of update.participants) {
        const text = renderTemplate(template?.value || 'Welcome, {user}.', {
          user: participant,
          group: metadata.subject,
          membercount: String(metadata.participants.length),
          date: new Date().toLocaleDateString()
        });
        await sock.sendMessage(update.id, { text });
      }
    } catch (error) {
      console.error('Welcomer error:', error);
    }
  });

  startSchedulers(sock);
}

console.log('🚀 Starting WhatsApp Expense Tracker Bot...');
if (ALLOWED_NUMBERS.length > 0) {
  startBot();
} else {
  console.log('⚠️ Bot will not connect until ALLOWED_NUMBERS is configured.');
  console.log('⚠️ Health endpoint is running — container will stay alive.');
}
