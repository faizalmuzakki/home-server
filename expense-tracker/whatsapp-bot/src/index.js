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
import fs from 'fs';

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

async function startBot() {
  setStatus('connecting');

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
}

console.log('🚀 Starting WhatsApp Expense Tracker Bot...');
if (ALLOWED_NUMBERS.length > 0) {
  startBot();
} else {
  console.log('⚠️ Bot will not connect until ALLOWED_NUMBERS is configured.');
  console.log('⚠️ Health endpoint is running — container will stay alive.');
}
