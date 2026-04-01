export function getText(msg) {
  return msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    '';
}

export function hasImage(msg) {
  return !!msg.message?.imageMessage;
}

export function isGroupMessage(jid) {
  return jid?.endsWith('@g.us');
}

export function normalizeJid(jid) {
  return jid?.split(':')[0] || jid;
}

export function getSenderId(msg) {
  return normalizeJid(msg.key.participant || msg.key.remoteJid || '');
}

export function getChatId(msg) {
  return msg.key.remoteJid;
}

export function getMentionedJids(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && parts.length < 2) parts.push(`${seconds}s`);

  return parts.join(' ') || '0s';
}

export function formatCountdown(ms) {
  const suffix = ms < 0 ? ' ago' : '';
  return `${formatDuration(Math.abs(ms))}${suffix}`;
}

export function parseDuration(input) {
  const match = input?.trim().match(/^(\d+)([smhd])$/i);
  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const map = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  };

  return value * map[unit];
}

export function parseDateTime(input) {
  const direct = new Date(input);
  if (!Number.isNaN(direct.getTime())) return direct;

  const ymdHm = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (ymdHm) {
    return new Date(
      Number(ymdHm[1]),
      Number(ymdHm[2]) - 1,
      Number(ymdHm[3]),
      Number(ymdHm[4] || 0),
      Number(ymdHm[5] || 0),
      0
    );
  }

  const dmyHm = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (dmyHm) {
    return new Date(
      Number(dmyHm[3]),
      Number(dmyHm[2]) - 1,
      Number(dmyHm[1]),
      Number(dmyHm[4] || 0),
      Number(dmyHm[5] || 0),
      0
    );
  }

  return null;
}

export async function reply(sock, jid, text, quoted) {
  try {
    return await sock.sendMessage(jid, { text }, quoted ? { quoted } : undefined);
  } catch (error) {
    if (quoted && error?.data === 406) {
      return sock.sendMessage(jid, { text });
    }
    throw error;
  }
}
