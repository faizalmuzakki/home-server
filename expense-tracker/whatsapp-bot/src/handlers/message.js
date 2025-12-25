import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { parseText, parseImage, createExpense, getCategories } from '../services/api.js';

const ALLOWED_NUMBERS = process.env.ALLOWED_NUMBERS?.split(',').map(n => n.trim()).filter(n => n) || [];
console.log('🔐 Allowed numbers configured:', ALLOWED_NUMBERS);

function isAllowed(jid) {
  if (ALLOWED_NUMBERS.length === 0) return true;
  const number = jid.split('@')[0];
  const allowed = ALLOWED_NUMBERS.includes(number);
  console.log(`🔍 Checking ${number} against allowed list: ${allowed}`);
  return allowed;
}

function extractText(msg) {
  return msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    '';
}

function hasImage(msg) {
  return !!msg.message?.imageMessage;
}

export async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;

  if (!isAllowed(jid)) {
    console.log(`Ignored message from unauthorized number: ${jid}`);
    return;
  }

  const text = extractText(msg).trim();

  // Handle commands
  if (text.toLowerCase() === '/help') {
    await sendHelp(sock, jid);
    return;
  }

  if (text.toLowerCase() === '/categories') {
    await sendCategories(sock, jid);
    return;
  }

  // Handle image (receipt)
  if (hasImage(msg)) {
    await handleImageExpense(sock, msg, jid, text);
    return;
  }

  // Handle text expense
  if (text) {
    await handleTextExpense(sock, jid, text);
    return;
  }
}

async function handleTextExpense(sock, jid, text) {
  await sock.sendMessage(jid, { text: '🔍 Parsing your expense...' });

  try {
    const parsed = await parseText(text);

    if (parsed.error) {
      await sock.sendMessage(jid, {
        text: `❌ Couldn't parse expense: ${parsed.error}\n\nTry format like: "50k lunch at warung" or "Grab 25000"`
      });
      return;
    }

    const expense = await createExpense({
      amount: parsed.amount,
      description: parsed.description,
      vendor: parsed.vendor,
      category_id: parsed.category_id,
      date: parsed.date,
      source: 'whatsapp',
      raw_text: text
    });

    await sock.sendMessage(jid, {
      text: `✅ *Expense Recorded!*\n\n` +
        `💰 Amount: ${formatCurrency(expense.amount)}\n` +
        `📝 Description: ${expense.description || '-'}\n` +
        `🏪 Vendor: ${expense.vendor || '-'}\n` +
        `📅 Date: ${expense.date}\n` +
        `🏷️ Category ID: ${expense.category_id}`
    });
  } catch (error) {
    console.error('Text expense error:', error);
    await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` });
  }
}

async function handleImageExpense(sock, msg, jid, caption) {
  await sock.sendMessage(jid, { text: '🔍 Analyzing receipt...' });

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const base64 = buffer.toString('base64');

    const parsed = await parseImage(base64);

    if (parsed.error) {
      await sock.sendMessage(jid, {
        text: `❌ Couldn't parse receipt: ${parsed.error}`
      });
      return;
    }

    const expense = await createExpense({
      amount: parsed.amount,
      description: parsed.description,
      vendor: parsed.vendor,
      category_id: parsed.category_id,
      date: parsed.date,
      source: 'whatsapp_image',
      raw_text: caption || null
    });

    let itemsList = '';
    if (parsed.items && parsed.items.length > 0) {
      itemsList = `\n📋 Items: ${parsed.items.slice(0, 5).join(', ')}`;
    }

    await sock.sendMessage(jid, {
      text: `✅ *Receipt Recorded!*\n\n` +
        `💰 Amount: ${formatCurrency(expense.amount)}\n` +
        `🏪 Vendor: ${expense.vendor || '-'}\n` +
        `📝 Description: ${expense.description || '-'}\n` +
        `📅 Date: ${expense.date}\n` +
        `🏷️ Category ID: ${expense.category_id}` +
        itemsList +
        `\n\n_Confidence: ${Math.round((parsed.confidence || 0) * 100)}%_`
    });
  } catch (error) {
    console.error('Image expense error:', error);
    await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` });
  }
}

async function sendHelp(sock, jid) {
  await sock.sendMessage(jid, {
    text: `📊 *Expense Tracker Bot*\n\n` +
      `*How to use:*\n` +
      `• Send text: "50k lunch at warung"\n` +
      `• Send receipt photo\n` +
      `• Photo + caption for context\n\n` +
      `*Commands:*\n` +
      `/help - Show this message\n` +
      `/categories - List categories\n\n` +
      `*Examples:*\n` +
      `• "Grab 25000"\n` +
      `• "Coffee 35k starbucks"\n` +
      `• "Groceries 150000 at supermarket"`
  });
}

async function sendCategories(sock, jid) {
  try {
    const categories = await getCategories();
    const list = categories.map(c => `${c.icon} ${c.name}`).join('\n');
    await sock.sendMessage(jid, {
      text: `📂 *Available Categories:*\n\n${list}`
    });
  } catch (error) {
    await sock.sendMessage(jid, { text: `❌ Error fetching categories` });
  }
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}
