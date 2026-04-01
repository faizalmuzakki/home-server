import { getDb } from '../database.js';
import { commands, getCommand } from '../commands/index.js';
import { handleGroupMessage } from './groupQA.js';
import { handleImageTransaction, handleTextTransaction } from './expense.js';
import {
  getChatId,
  getMentionedJids,
  getSenderId,
  getText,
  hasImage,
  isGroupMessage,
  normalizeJid,
  reply
} from '../utils/message.js';

const ALLOWED_NUMBERS = process.env.ALLOWED_NUMBERS?.split(',').map((number) => number.trim()).filter(Boolean) || [];

function isAllowed(jid) {
  if (ALLOWED_NUMBERS.length === 0) return true;
  return ALLOWED_NUMBERS.includes(normalizeJid(jid).split('@')[0]);
}

function parseCommand(text) {
  if (!text.startsWith('/')) return null;
  const [command, ...args] = text.slice(1).trim().split(/\s+/);
  return {
    name: command.toLowerCase(),
    args,
    argText: text.slice(1 + command.length).trim()
  };
}

function isBotMentioned(msg, botJid) {
  const botNumber = normalizeJid(botJid)?.split('@')[0];
  return getMentionedJids(msg).some((jid) => normalizeJid(jid)?.split('@')[0] === botNumber);
}

async function isAdmin(sock, jid, senderId) {
  if (!jid?.endsWith('@g.us')) return true;
  try {
    const metadata = await sock.groupMetadata(jid);
    const participant = metadata.participants.find((entry) => normalizeJid(entry.id) === normalizeJid(senderId));
    return !!participant?.admin;
  } catch (error) {
    console.error('Admin lookup error:', error);
    return false;
  }
}

function logMessage(chatId, senderId, text) {
  if (!text) return;
  getDb().prepare(
    'INSERT INTO message_history (chat_id, user_id, message_text, created_at) VALUES (?, ?, ?, ?)'
  ).run(chatId, senderId, text, Date.now());
}

async function handleAfkSideEffects(sock, msg, jid, senderId, text) {
  if (!isGroupMessage(jid)) return;
  const db = getDb();
  const existing = db.prepare('SELECT message, since FROM afk_status WHERE user_id = ?').get(senderId);
  if (existing) {
    db.prepare('DELETE FROM afk_status WHERE user_id = ?').run(senderId);
    await reply(sock, jid, `Welcome back. Your AFK status was cleared after ${Math.floor((Date.now() - existing.since) / 60000)} minute(s).`, msg);
  }

  if (!text) return;
  const mentioned = getMentionedJids(msg);
  for (const userId of mentioned) {
    const afk = db.prepare('SELECT message, since FROM afk_status WHERE user_id = ?').get(userId);
    if (afk) {
      await reply(sock, jid, `${userId} is AFK: ${afk.message}`, msg);
    }
  }
}

async function handleAutoresponder(sock, jid, text, msg) {
  if (!text || text.startsWith('/')) return false;
  const rows = getDb().prepare(
    'SELECT trigger_text, response_text, match_type FROM autoresponders WHERE chat_id = ? ORDER BY created_at DESC'
  ).all(jid);
  const lowerText = text.toLowerCase();
  for (const row of rows) {
    const matched = row.match_type === 'exact'
      ? lowerText === row.trigger_text
      : row.match_type === 'startswith'
        ? lowerText.startsWith(row.trigger_text)
        : lowerText.includes(row.trigger_text);
    if (matched) {
      await reply(sock, jid, row.response_text, msg);
      return true;
    }
  }
  return false;
}

export async function handleMessage(sock, msg, botJid) {
  const jid = getChatId(msg);
  const senderId = getSenderId(msg);
  const text = getText(msg).trim();
  const isGroup = isGroupMessage(jid);

  if (!jid || (!isGroup && !isAllowed(senderId))) {
    console.log(`Ignored message from unauthorized number: ${senderId}`);
    return;
  }

  logMessage(jid, senderId, text);
  await handleAfkSideEffects(sock, msg, jid, senderId, text);

  const parsed = parseCommand(text);

  if (parsed) {
    const command = getCommand(parsed.name);
    if (!command) {
      return reply(sock, jid, `Unknown command. Use /help.\nAvailable commands: ${commands.map((entry) => `/${entry.name}`).join(', ')}`, msg);
    }

    let _isAdminPromise;
    const getIsAdmin = () => {
      if (_isAdminPromise === undefined) _isAdminPromise = isAdmin(sock, jid, senderId);
      return _isAdminPromise;
    };

    try {
      await command.execute({
        sock,
        msg,
        jid,
        senderId,
        text,
        args: [...parsed.args],
        argText: parsed.argText,
        isGroup,
        getIsAdmin
      });
    } catch (error) {
      console.error(`Command /${parsed.name} failed:`, error);
      try {
        await reply(sock, jid, `Command failed: ${error.message}`, msg);
      } catch {
        // reply itself failed (e.g. not-acceptable / session not ready); error already logged above
      }
    }
    return;
  }

  if (isGroup && isBotMentioned(msg, botJid)) {
    await handleGroupMessage(sock, msg, botJid);
    return;
  }

  if (await handleAutoresponder(sock, jid, text, msg)) {
    return;
  }

  if (hasImage(msg)) {
    if (!isGroup) await handleImageTransaction(sock, msg, jid, text);
    return;
  }

  if (!isGroup && text) {
    await handleTextTransaction(sock, jid, text, msg);
  }
}
