import pkg from '@whiskeysockets/baileys';
const { downloadMediaMessage } = pkg;

import { createExpense, getCategories, parseImage, parseText, uploadImage } from '../services/api.js';
import { formatCurrency, reply } from '../utils/message.js';

export async function sendCategories(sock, jid, msg) {
  try {
    const categories = await getCategories();
    const expenseCategories = categories.filter((category) => category.type !== 'income');
    const incomeCategories = categories.filter((category) => category.type === 'income');

    await reply(
      sock,
      jid,
      `Expense categories:\n${expenseCategories.map((category) => `${category.icon} ${category.name}`).join('\n')}\n\nIncome categories:\n${incomeCategories.map((category) => `${category.icon} ${category.name}`).join('\n')}`,
      msg
    );
  } catch {
    await reply(sock, jid, 'Could not fetch categories.', msg);
  }
}

export async function sendPin(sock, jid, msg) {
  const pin = process.env.DASHBOARD_PIN || '123456';
  await reply(
    sock,
    jid,
    `Dashboard PIN\n\n${pin}\n\nUse it at https://expenses.solork.dev`,
    msg
  );
}

export async function handleTextTransaction(sock, jid, text, msg) {
  await reply(sock, jid, 'Analyzing...', msg);

  try {
    const parsed = await parseText(text);
    if (parsed.error) {
      return reply(
        sock,
        jid,
        `Couldn't parse: ${parsed.error}\n\nTry:\n50k lunch at warung\nGrab 25000\nReceived 5m salary`,
        msg
      );
    }

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

    const isIncome = parsed.type === 'income';
    const inputCost = (parsed.usage?.input_tokens || 0) * 0.000003;
    const outputCost = (parsed.usage?.output_tokens || 0) * 0.000015;
    const totalCost = (inputCost + outputCost).toFixed(6);

    await reply(
      sock,
      jid,
      `${isIncome ? 'Income' : 'Expense'} recorded\n\nAmount: ${formatCurrency(transaction.amount)}\nDescription: ${transaction.description || '-'}\n${isIncome ? 'From' : 'Vendor'}: ${transaction.vendor || '-'}\nDate: ${transaction.date}\nCategory ID: ${transaction.category_id}\n\nTokens: ${parsed.usage?.input_tokens || 0}/${parsed.usage?.output_tokens || 0} (~$${totalCost})`,
      msg
    );
  } catch (error) {
    await reply(sock, jid, `Error: ${error.message}`, msg);
  }
}

export async function handleImageTransaction(sock, msg, jid, caption = '') {
  await reply(sock, jid, 'Analyzing image...', msg);

  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const base64 = buffer.toString('base64');
    const parsed = await parseImage(base64);

    if (parsed.error) {
      return reply(sock, jid, `Couldn't parse: ${parsed.error}`, msg);
    }

    let imageUrl = null;
    try {
      const filename = `receipt_${Date.now()}.jpg`;
      const uploadResult = await uploadImage(base64, filename);
      imageUrl = uploadResult.image_url;
    } catch (error) {
      console.error('Failed to save image:', error);
    }

    const transaction = await createExpense({
      amount: parsed.amount,
      description: parsed.description,
      vendor: parsed.vendor,
      category_id: parsed.category_id,
      date: parsed.date,
      type: parsed.type || 'expense',
      source: 'whatsapp_image',
      image_url: imageUrl,
      raw_text: caption || null
    });

    const isIncome = parsed.type === 'income';
    const inputCost = (parsed.usage?.input_tokens || 0) * 0.000003;
    const outputCost = (parsed.usage?.output_tokens || 0) * 0.000015;
    const totalCost = (inputCost + outputCost).toFixed(6);

    await reply(
      sock,
      jid,
      `${isIncome ? 'Income proof recorded' : 'Receipt recorded'}\n\nAmount: ${formatCurrency(transaction.amount)}\n${isIncome ? 'From' : 'Vendor'}: ${transaction.vendor || '-'}\nDescription: ${transaction.description || '-'}\nDate: ${transaction.date}${parsed.items?.length ? `\nItems: ${parsed.items.slice(0, 5).join(', ')}` : ''}${imageUrl ? '\nImage: saved' : ''}\n\nConfidence: ${Math.round((parsed.confidence || 0) * 100)}% | Tokens: ${parsed.usage?.input_tokens || 0}/${parsed.usage?.output_tokens || 0} (~$${totalCost})`,
      msg
    );
  } catch (error) {
    await reply(sock, jid, `Error: ${error.message}`, msg);
  }
}
