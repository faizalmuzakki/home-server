import { askQuestion } from '../services/ai.js';
import { isGroupMessage, normalizeJid } from '../utils/message.js';

const ALLOWED_GROUPS = process.env.ALLOWED_GROUPS?.split(',').map(g => g.trim()).filter(g => g) || [];

if (ALLOWED_GROUPS.length > 0) {
  console.log(`🔐 Q&A enabled for ${ALLOWED_GROUPS.length} group(s):`, ALLOWED_GROUPS);
} else {
  console.log('ℹ️ No ALLOWED_GROUPS configured — group Q&A is disabled');
}

function isAllowedGroup(jid) {
  if (ALLOWED_GROUPS.length === 0) return false;
  return ALLOWED_GROUPS.includes(jid);
}

function isBotMentioned(msg, botJid) {
  const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  const botNumber = normalizeJid(botJid)?.split('@')[0];
  return mentionedJids.some((jid) => normalizeJid(jid)?.split('@')[0] === botNumber);
}

function extractQuestion(msg, botJid) {
  const text = msg.message?.extendedTextMessage?.text ||
    msg.message?.conversation ||
    '';

  // Remove @mention from the text
  const botNumber = normalizeJid(botJid)?.split('@')[0];
  // WhatsApp mentions look like @628xxx in the text
  const cleaned = text.replace(new RegExp(`@${botNumber}\\b`, 'g'), '').trim();
  return cleaned;
}

export async function handleGroupMessage(sock, msg, botJid) {
  const groupJid = msg.key.remoteJid;

  // Log group JID for discovery (helps user find group IDs)
  console.log(`📨 Group message from: ${groupJid}`);

  if (!isAllowedGroup(groupJid)) {
    return; // Silently ignore non-allowed groups
  }

  if (!isBotMentioned(msg, botJid)) {
    return; // Only respond when mentioned
  }

  const question = extractQuestion(msg, botJid);

  if (!question) {
    await sock.sendMessage(groupJid, {
      text: '❓ Please ask me a question after mentioning me!',
    }, { quoted: msg });
    return;
  }

  console.log(`🤖 Q&A request in group ${groupJid}: "${question.substring(0, 100)}..."`);

  try {
    await sock.sendMessage(groupJid, {
      text: '🤔 Thinking...',
    }, { quoted: msg });

    const { answer, usage } = await askQuestion(question);

    // Calculate approximate cost (Claude Sonnet 4 pricing)
    const inputCost = (usage.input_tokens || 0) * 0.000003;
    const outputCost = (usage.output_tokens || 0) * 0.000015;
    const totalCost = (inputCost + outputCost).toFixed(6);

    await sock.sendMessage(groupJid, {
      text: `${answer}\n\n_Tokens: ${usage.input_tokens}/${usage.output_tokens} (~$${totalCost})_`,
    }, { quoted: msg });
  } catch (error) {
    console.error('Group Q&A error:', error);
    await sock.sendMessage(groupJid, {
      text: `❌ Sorry, I couldn't process that: ${error.message}`,
    }, { quoted: msg });
  }
}
