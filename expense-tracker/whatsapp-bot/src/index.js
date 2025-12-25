import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import { handleMessage } from './handlers/message.js';
import fs from 'fs';

dotenv.config();

const logger = pino({ level: 'info' });  // Changed to info for more logs

async function startBot() {
  console.log('📂 Loading auth state...');
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  console.log('✅ Auth state loaded');

  const sock = makeWASocket({
    auth: state,
    logger,
    browser: ['ExpenseTracker', 'Chrome', '120.0.0'],
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
