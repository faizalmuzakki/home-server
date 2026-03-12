import pkg from '@whiskeysockets/baileys';
const { downloadMediaMessage } = pkg;
import { parseText, parseImage, createExpense, getCategories, uploadImage } from '../services/api.js';
import { isGroupMessage, handleGroupMessage } from './groupQA.js';

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

export async function handleMessage(sock, msg, botJid) {
  const jid = msg.key.remoteJid;

  // Route group messages to Q&A handler
  if (isGroupMessage(jid)) {
    await handleGroupMessage(sock, msg, botJid);
    return;
  }

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

  if (text.toLowerCase() === '/pin') {
    await sendPin(sock, jid);
    return;
  }

  // Handle image (receipt or income proof)
  if (hasImage(msg)) {
    await handleImageTransaction(sock, msg, jid, text);
    return;
  }

  // Handle text transaction
  if (text) {
    await handleTextTransaction(sock, jid, text);
    return;
  }
}

async function handleTextTransaction(sock, jid, text) {
  await sock.sendMessage(jid, { text: '🔍 Analyzing...' });

  try {
    const parsed = await parseText(text);

    if (parsed.error) {
      await sock.sendMessage(jid, {
        text: `❌ Couldn't parse: ${parsed.error}\n\nTry:\n• "50k lunch at warung" (expense)\n• "Received 5m salary" (income)`
      });
      return;
    }

    const isIncome = parsed.type === 'income';

    const transaction = await createExpense({
      amount: parsed.amount,
      description: parsed.description,
      vendor: parsed.vendor,
      category_id: parsed.category_id,
      date: parsed.date,
      type: parsed.type || 'expense',
      source: 'whatsapp',
      raw_text: text
    });

    const emoji = isIncome ? '💵' : '✅';
    const label = isIncome ? 'Income Recorded!' : 'Expense Recorded!';
    const vendorLabel = isIncome ? 'From' : 'Vendor';

    // Calculate approximate cost (Claude Sonnet 4 pricing)
    const inputCost = (parsed.usage?.input_tokens || 0) * 0.000003;
    const outputCost = (parsed.usage?.output_tokens || 0) * 0.000015;
    const totalCost = (inputCost + outputCost).toFixed(6);

    await sock.sendMessage(jid, {
      text: `${emoji} *${label}*\n\n` +
        `💰 Amount: ${formatCurrency(transaction.amount)}\n` +
        `📝 Description: ${transaction.description || '-'}\n` +
        `🏪 ${vendorLabel}: ${transaction.vendor || '-'}\n` +
        `📅 Date: ${transaction.date}\n` +
        `🏷️ Category ID: ${transaction.category_id}\n\n` +
        `_Tokens: ${parsed.usage?.input_tokens || 0}/${parsed.usage?.output_tokens || 0} (~$${totalCost})_`
    });
  } catch (error) {
    console.error('Text transaction error:', error);
    await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` });
  }
}

async function handleImageTransaction(sock, msg, jid, caption) {
  await sock.sendMessage(jid, { text: '🔍 Analyzing image...' });

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const base64 = buffer.toString('base64');

    // Parse the image first
    const parsed = await parseImage(base64);

    if (parsed.error) {
      await sock.sendMessage(jid, {
        text: `❌ Couldn't parse: ${parsed.error}`
      });
      return;
    }

    // Save the image
    let imageUrl = null;
    try {
      const timestamp = Date.now();
      const filename = `receipt_${timestamp}.jpg`;
      const uploadResult = await uploadImage(base64, filename);
      imageUrl = uploadResult.image_url;
      console.log('📸 Image saved:', imageUrl);
    } catch (uploadError) {
      console.error('Failed to save image:', uploadError);
      // Continue without image - it's not critical
    }

    const isIncome = parsed.type === 'income';

    const transaction = await createExpense({
      amount: parsed.amount,
      description: parsed.description,
      vendor: parsed.vendor,
      category_id: parsed.category_id,
      date: parsed.date,
      type: parsed.type || 'expense',
      source: 'whatsapp_image',
      image_url: imageUrl, // Save the image URL
      raw_text: caption || null
    });

    let itemsList = '';
    if (parsed.items && parsed.items.length > 0) {
      itemsList = `\n📋 Items: ${parsed.items.slice(0, 5).join(', ')}`;
    }

    // Calculate approximate cost (Claude Sonnet 4 pricing)
    const inputCost = (parsed.usage?.input_tokens || 0) * 0.000003;
    const outputCost = (parsed.usage?.output_tokens || 0) * 0.000015;
    const totalCost = (inputCost + outputCost).toFixed(6);

    const emoji = isIncome ? '💵' : '✅';
    const label = isIncome ? 'Income Recorded!' : 'Receipt Recorded!';
    const vendorLabel = isIncome ? 'From' : 'Vendor';

    let imageNote = '';
    if (imageUrl) {
      imageNote = `\n📸 Image: Saved`;
    }

    await sock.sendMessage(jid, {
      text: `${emoji} *${label}*\n\n` +
        `💰 Amount: ${formatCurrency(transaction.amount)}\n` +
        `🏪 ${vendorLabel}: ${transaction.vendor || '-'}\n` +
        `📝 Description: ${transaction.description || '-'}\n` +
        `📅 Date: ${transaction.date}` +
        itemsList +
        imageNote +
        `\n\n_Confidence: ${Math.round((parsed.confidence || 0) * 100)}% | Tokens: ${parsed.usage?.input_tokens || 0}/${parsed.usage?.output_tokens || 0} (~$${totalCost})_`
    });
  } catch (error) {
    console.error('Image transaction error:', error);
    await sock.sendMessage(jid, { text: `❌ Error: ${error.message}` });
  }
}

async function sendHelp(sock, jid) {
  await sock.sendMessage(jid, {
    text: `📊 *Finance Tracker Bot*\n\n` +
      `*Track Expenses:*\n` +
      `• "50k lunch at warung"\n` +
      `• "Grab 25000"\n` +
      `• Send receipt photo\n\n` +
      `*Track Income:*\n` +
      `• "Received 5m salary"\n` +
      `• "Got paid 2.5m freelance"\n` +
      `• "Dapat transfer 500k dari client"\n` +
      `• Send transfer screenshot\n\n` +
      `*Commands:*\n` +
      `/help - Show this message\n` +
      `/categories - List categories\n` +
      `/pin - Get dashboard PIN`
  });
}

async function sendCategories(sock, jid) {
  try {
    const categories = await getCategories();
    const expenseCategories = categories.filter(c => c.type !== 'income');
    const incomeCategories = categories.filter(c => c.type === 'income');

    const expenseList = expenseCategories.map(c => `${c.icon} ${c.name}`).join('\n');
    const incomeList = incomeCategories.map(c => `${c.icon} ${c.name}`).join('\n');

    await sock.sendMessage(jid, {
      text: `📂 *Expense Categories:*\n${expenseList}\n\n💵 *Income Categories:*\n${incomeList}`
    });
  } catch (error) {
    await sock.sendMessage(jid, { text: `❌ Error fetching categories` });
  }
}

async function sendPin(sock, jid) {
  const pin = process.env.DASHBOARD_PIN || '123456';
  await sock.sendMessage(jid, {
    text: `🔐 *Dashboard PIN*\n\n` +
      `Your PIN: *${pin}*\n\n` +
      `Use this to login at:\nhttps://expenses.solork.dev`
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}
