import pkg from '@whiskeysockets/baileys';
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage,
  fetchLatestBaileysVersion
} = pkg;
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import { handleMessage } from './handlers/message.js';
import fs from 'fs';

dotenv.config();

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
  process.exit(1);
}

console.log(`🔐 Security: ${ALLOWED_NUMBERS.length} phone number(s) whitelisted`);


const logger = pino({ level: 'info' });

async function startBot() {
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
        setTimeout(() => startBot(), 3000);  // Add delay before reconnect
      }
    } else if (connection === 'open') {
      console.log('✅ WhatsApp bot connected!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      try {
        await handleMessage(sock, msg);
      } catch (error) {
        console.error('Error handling message:', error);
      }
    }
  });
}

console.log('🚀 Starting WhatsApp Expense Tracker Bot...');
startBot();
