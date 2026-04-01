import QRCode from 'qrcode';
import { getDb } from '../database.js';
import { sendCategories, sendPin } from '../handlers/expense.js';
import {
  formatCountdown,
  formatDuration,
  getMentionedJids,
  parseDateTime,
  parseDuration,
  reply
} from '../utils/message.js';
import {
  askQuestion,
  explainTopic,
  recapMessages,
  summarizeText,
  translateText
} from '../services/ai.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const EMOJI_NAMES = {
  '😀': 'Grinning Face',
  '😂': 'Face with Tears of Joy',
  '❤️': 'Red Heart',
  '👍': 'Thumbs Up',
  '👎': 'Thumbs Down',
  '🎉': 'Party Popper',
  '🔥': 'Fire',
  '⭐': 'Star',
  '💀': 'Skull',
  '👀': 'Eyes',
  '🤔': 'Thinking Face',
  '😎': 'Smiling Face with Sunglasses'
};

function getUsage(name, usage) {
  return usage ? `Usage: /${name} ${usage}` : `Usage: /${name}`;
}

function codePointsForEmoji(input) {
  return [...input].map((char) => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
}

function parsePipeArgs(text) {
  return text.split('|').map((part) => part.trim()).filter(Boolean);
}

function getHistoryLines(chatId, hours) {
  const since = Date.now() - hours * 60 * 60 * 1000;
  return getDb()
    .prepare('SELECT user_id, message_text FROM message_history WHERE chat_id = ? AND created_at >= ? ORDER BY created_at ASC LIMIT 300')
    .all(chatId, since)
    .map((row) => `[${row.user_id}]: ${row.message_text}`);
}

async function fetchTriviaQuestion(category, difficulty) {
  const categories = {
    general: 9,
    science: 17,
    computers: 18,
    games: 15,
    film: 11,
    music: 12,
    history: 23,
    geography: 22,
    sports: 21
  };
  let url = 'https://opentdb.com/api.php?amount=1&type=multiple';
  if (category && categories[category]) url += `&category=${categories[category]}`;
  if (difficulty && ['easy', 'medium', 'hard'].includes(difficulty)) url += `&difficulty=${difficulty}`;
  const response = await fetch(url);
  const data = await response.json();
  const item = data.results?.[0];
  if (!item) throw new Error('No trivia question available');
  const decode = (text) => text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'");
  const correct = decode(item.correct_answer);
  const options = [correct, ...item.incorrect_answers.map(decode)];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return {
    category: decode(item.category),
    difficulty: item.difficulty,
    question: decode(item.question),
    options,
    correctAnswer: correct
  };
}

async function getWeather(location, units = 'metric') {
  const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`);
  if (!response.ok) throw new Error('Location not found');
  const data = await response.json();
  const current = data.current_condition?.[0];
  const area = data.nearest_area?.[0];
  if (!current) throw new Error('Invalid weather response');

  const temperature = units === 'imperial'
    ? `${current.temp_F}°F`
    : units === 'standard'
      ? `${(parseFloat(current.temp_C) + 273.15).toFixed(1)}K`
      : `${current.temp_C}°C`;
  const feelsLike = units === 'imperial'
    ? `${current.FeelsLikeF}°F`
    : units === 'standard'
      ? `${(parseFloat(current.FeelsLikeC) + 273.15).toFixed(1)}K`
      : `${current.FeelsLikeC}°C`;
  const locationName = area
    ? `${area.areaName?.[0]?.value || location}, ${area.country?.[0]?.value || ''}`.trim()
    : location;

  return {
    locationName,
    condition: current.weatherDesc?.[0]?.value || 'Unknown',
    temperature,
    feelsLike,
    humidity: current.humidity,
    wind: `${current.windspeedKmph} km/h ${current.winddir16Point}`,
    visibility: `${current.visibility} km`
  };
}

async function shortenUrl(input) {
  const response = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(input)}`);
  const data = await response.json();
  if (!response.ok || data.errorcode) {
    throw new Error(data.errormessage || 'URL shortening failed');
  }
  return data.shorturl;
}

function audit(chatId, action, actorId, details = null, targetId = null) {
  getDb().prepare(
    'INSERT INTO audit_logs (chat_id, action, actor_id, target_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(chatId, action, actorId, targetId, details, Date.now());
}

function groupOnly(ctx) {
  if (!ctx.isGroup) {
    reply(ctx.sock, ctx.jid, 'This command only works in group chats.', ctx.msg);
    return false;
  }
  return true;
}

async function adminOnly(ctx) {
  if (!await ctx.getIsAdmin()) {
    await reply(ctx.sock, ctx.jid, 'Only group admins can use this command.', ctx.msg);
    return false;
  }
  return true;
}

export const commands = [
  {
    name: 'categories',
    category: 'Finance',
    description: 'List expense and income categories',
    async execute(ctx) {
      await sendCategories(ctx.sock, ctx.jid, ctx.msg);
    }
  },
  {
    name: 'pin',
    category: 'Finance',
    description: 'Show the dashboard PIN',
    async execute(ctx) {
      await sendPin(ctx.sock, ctx.jid, ctx.msg);
    }
  },
  {
    name: 'help',
    category: 'General',
    description: 'Show command help',
    async execute(ctx) {
      const groups = new Map();
      for (const command of commands) {
        if (!groups.has(command.category)) groups.set(command.category, []);
        groups.get(command.category).push(command);
      }

      const lines = ['Finance Tracker + Utility Bot', ''];
      for (const [category, items] of groups.entries()) {
        lines.push(`*${category}*`);
        for (const item of items) {
          lines.push(`/${item.name}${item.usage ? ` ${item.usage}` : ''} - ${item.description}`);
        }
        lines.push('');
      }

      lines.push('Send a text like "50k lunch" or a receipt image in a private chat to track expenses without a command.');
      await reply(ctx.sock, ctx.jid, lines.join('\n').trim(), ctx.msg);
    }
  },
  {
    name: 'tldr',
    category: 'AI',
    usage: '<text> [bullets|sentence|paragraph|takeaways]',
    description: 'Summarize text',
    async execute(ctx) {
      const styles = new Set(['bullets', 'sentence', 'paragraph', 'takeaways']);
      const parts = [...ctx.args];
      const style = styles.has(parts[parts.length - 1]) ? parts.pop() : 'bullets';
      const input = parts.join(' ').trim();
      if (!input) return reply(ctx.sock, ctx.jid, getUsage('tldr', this.usage), ctx.msg);
      await reply(ctx.sock, ctx.jid, 'Summarizing...', ctx.msg);
      const result = await summarizeText(input, style);
      await reply(ctx.sock, ctx.jid, `TL;DR (${style})\n${result.text}`, ctx.msg);
    }
  },
  {
    name: 'explain',
    category: 'AI',
    usage: '<topic> [eli5|beginner|intermediate|advanced|expert]',
    description: 'Explain a topic',
    async execute(ctx) {
      const levels = new Set(['eli5', 'beginner', 'intermediate', 'advanced', 'expert']);
      const parts = [...ctx.args];
      const level = levels.has(parts[parts.length - 1]) ? parts.pop() : 'beginner';
      const topic = parts.join(' ').trim();
      if (!topic) return reply(ctx.sock, ctx.jid, getUsage('explain', this.usage), ctx.msg);
      await reply(ctx.sock, ctx.jid, 'Explaining...', ctx.msg);
      const result = await explainTopic(topic, level);
      await reply(ctx.sock, ctx.jid, `${topic} (${level})\n${result.text}`, ctx.msg);
    }
  },
  {
    name: 'translate',
    category: 'AI',
    usage: '<to-language> | <text> [| <from-language|auto>]',
    description: 'Translate text',
    async execute(ctx) {
      const [targetLanguage, text, sourceLanguage = 'auto'] = parsePipeArgs(ctx.argText);
      if (!targetLanguage || !text) return reply(ctx.sock, ctx.jid, getUsage('translate', this.usage), ctx.msg);
      await reply(ctx.sock, ctx.jid, 'Translating...', ctx.msg);
      const result = await translateText(targetLanguage, text, sourceLanguage);
      await reply(ctx.sock, ctx.jid, result.text, ctx.msg);
    }
  },
  {
    name: 'recap',
    category: 'AI',
    usage: '[hours]',
    description: 'Recap recent chat history',
    async execute(ctx) {
      const hours = Math.max(1, Math.min(72, parseInt(ctx.args[0] || '24', 10) || 24));
      const history = getHistoryLines(ctx.jid, hours);
      if (history.length === 0) return reply(ctx.sock, ctx.jid, `No stored messages found in the last ${hours} hour(s).`, ctx.msg);
      await reply(ctx.sock, ctx.jid, 'Building recap...', ctx.msg);
      const result = await recapMessages(history, hours);
      await reply(ctx.sock, ctx.jid, `Recap (${hours}h)\n${result.text}`, ctx.msg);
    }
  },
  {
    name: 'ask',
    category: 'AI',
    usage: '<question>',
    description: 'Ask the AI a question',
    async execute(ctx) {
      const question = ctx.argText.trim();
      if (!question) return reply(ctx.sock, ctx.jid, getUsage('ask', this.usage), ctx.msg);
      await reply(ctx.sock, ctx.jid, 'Thinking...', ctx.msg);
      const result = await askQuestion(question);
      await reply(ctx.sock, ctx.jid, result.answer, ctx.msg);
    }
  },
  {
    name: 'weather',
    category: 'Utility',
    usage: '<location> [metric|imperial|standard]',
    description: 'Get weather info',
    async execute(ctx) {
      const unit = ['metric', 'imperial', 'standard'].includes(ctx.args.at(-1)) ? ctx.args.pop() : 'metric';
      const location = ctx.args.join(' ').trim();
      if (!location) return reply(ctx.sock, ctx.jid, getUsage('weather', this.usage), ctx.msg);
      const weather = await getWeather(location, unit);
      await reply(
        ctx.sock,
        ctx.jid,
        `Weather in ${weather.locationName}\nCondition: ${weather.condition}\nTemperature: ${weather.temperature} (feels like ${weather.feelsLike})\nWind: ${weather.wind}\nHumidity: ${weather.humidity}%\nVisibility: ${weather.visibility}`,
        ctx.msg
      );
    }
  },
  {
    name: 'qrcode',
    category: 'Utility',
    usage: '<text>',
    description: 'Generate a QR code image',
    async execute(ctx) {
      const input = ctx.argText.trim();
      if (!input) return reply(ctx.sock, ctx.jid, getUsage('qrcode', this.usage), ctx.msg);
      const buffer = await QRCode.toBuffer(input, { width: 400 });
      await ctx.sock.sendMessage(ctx.jid, {
        image: buffer,
        caption: `QR code for:\n${input.length > 200 ? `${input.slice(0, 200)}...` : input}`
      }, { quoted: ctx.msg });
    }
  },
  {
    name: 'shorten',
    category: 'Utility',
    usage: '<url>',
    description: 'Shorten a URL',
    async execute(ctx) {
      const input = ctx.argText.trim();
      if (!input) return reply(ctx.sock, ctx.jid, getUsage('shorten', this.usage), ctx.msg);
      try {
        new URL(input);
      } catch {
        return reply(ctx.sock, ctx.jid, 'Please provide a valid URL.', ctx.msg);
      }
      const shortUrl = await shortenUrl(input);
      await reply(ctx.sock, ctx.jid, `Short URL:\n${shortUrl}\n\nOriginal:\n${input}`, ctx.msg);
    }
  },
  {
    name: 'emoji',
    category: 'Utility',
    usage: '<emoji>',
    description: 'Show emoji metadata',
    async execute(ctx) {
      const input = ctx.argText.trim();
      if (!input) return reply(ctx.sock, ctx.jid, getUsage('emoji', this.usage), ctx.msg);
      await reply(
        ctx.sock,
        ctx.jid,
        `Emoji: ${input}\nName: ${EMOJI_NAMES[input] || 'Unicode Character'}\nCode points: ${codePointsForEmoji(input)}\nJS: ${[...input].map((char) => `\\u{${char.codePointAt(0).toString(16)}}`).join('')}`,
        ctx.msg
      );
    }
  },
  {
    name: 'afk',
    category: 'Productivity',
    usage: '[message]',
    description: 'Set or clear AFK status',
    async execute(ctx) {
      if (!groupOnly(ctx)) return;
      const db = getDb();
      const existing = db.prepare('SELECT message, since FROM afk_status WHERE user_id = ?').get(ctx.senderId);
      const message = ctx.argText.trim();

      if (!message) {
        if (!existing) return reply(ctx.sock, ctx.jid, 'You are not AFK. Use /afk <message> to set it.', ctx.msg);
        db.prepare('DELETE FROM afk_status WHERE user_id = ?').run(ctx.senderId);
        return reply(ctx.sock, ctx.jid, `Welcome back. You were AFK for ${formatDuration(Date.now() - existing.since)}.`, ctx.msg);
      }

      db.prepare('INSERT OR REPLACE INTO afk_status (user_id, chat_id, message, since) VALUES (?, ?, ?, ?)')
        .run(ctx.senderId, ctx.jid, message, Date.now());
      audit(ctx.jid, 'afk_set', ctx.senderId, message);
      await reply(ctx.sock, ctx.jid, `AFK set: ${message}`, ctx.msg);
    }
  },
  {
    name: 'countdown',
    category: 'Productivity',
    usage: '<datetime>',
    description: 'Count down to a date',
    async execute(ctx) {
      const input = ctx.argText.trim();
      if (!input) return reply(ctx.sock, ctx.jid, getUsage('countdown', this.usage), ctx.msg);
      const target = parseDateTime(input);
      if (!target || Number.isNaN(target.getTime())) {
        return reply(ctx.sock, ctx.jid, 'Try a date like 2026-12-25 15:30, 2026-12-25, or 25/12/2026 15:30.', ctx.msg);
      }
      const diff = target.getTime() - Date.now();
      await reply(ctx.sock, ctx.jid, `Target: ${target.toLocaleString()}\n${diff < 0 ? 'Time elapsed' : 'Time remaining'}: ${formatCountdown(diff)}`, ctx.msg);
    }
  },
  {
    name: 'todo',
    category: 'Productivity',
    usage: '<add|list|done|undone|remove|clear> ...',
    description: 'Manage personal todos',
    async execute(ctx) {
      const db = getDb();
      const subcommand = (ctx.args[0] || '').toLowerCase();
      if (!subcommand) return reply(ctx.sock, ctx.jid, getUsage('todo', this.usage), ctx.msg);

      if (subcommand === 'add') {
        const task = ctx.args.slice(1).join(' ').trim();
        if (!task) return reply(ctx.sock, ctx.jid, 'Provide a task to add.', ctx.msg);
        db.prepare('INSERT INTO todos (user_id, chat_id, task, created_at) VALUES (?, ?, ?, ?)')
          .run(ctx.senderId, ctx.jid, task, Date.now());
        audit(ctx.jid, 'todo_add', ctx.senderId, task);
        return reply(ctx.sock, ctx.jid, `Added todo: ${task}`, ctx.msg);
      }

      if (subcommand === 'list') {
        const showAll = ['all', 'completed'].includes((ctx.args[1] || '').toLowerCase());
        const rows = db.prepare('SELECT id, task, completed FROM todos WHERE user_id = ? ORDER BY completed ASC, created_at ASC').all(ctx.senderId);
        const visible = showAll ? rows : rows.filter((row) => row.completed === 0);
        if (visible.length === 0) return reply(ctx.sock, ctx.jid, showAll ? 'No todos found.' : 'No pending todos.', ctx.msg);
        const pending = rows.filter((row) => row.completed === 0).length;
        const completed = rows.filter((row) => row.completed === 1).length;
        return reply(
          ctx.sock,
          ctx.jid,
          `Your todos\n${visible.slice(0, 20).map((row) => `${row.completed ? '✅' : '⬜'} ${row.id}. ${row.task}`).join('\n')}\n\nPending: ${pending} | Completed: ${completed}`,
          ctx.msg
        );
      }

      if (['done', 'complete', 'undone', 'remove', 'delete'].includes(subcommand)) {
        const id = Number(ctx.args[1]);
        if (Number.isNaN(id)) return reply(ctx.sock, ctx.jid, 'Provide a valid todo id.', ctx.msg);
        if (subcommand === 'done' || subcommand === 'complete') {
          const result = db.prepare('UPDATE todos SET completed = 1 WHERE id = ? AND user_id = ?').run(id, ctx.senderId);
          return reply(ctx.sock, ctx.jid, result.changes ? `Marked todo #${id} done.` : 'Todo not found.', ctx.msg);
        }
        if (subcommand === 'undone') {
          const result = db.prepare('UPDATE todos SET completed = 0 WHERE id = ? AND user_id = ?').run(id, ctx.senderId);
          return reply(ctx.sock, ctx.jid, result.changes ? `Marked todo #${id} not done.` : 'Todo not found.', ctx.msg);
        }
        const result = db.prepare('DELETE FROM todos WHERE id = ? AND user_id = ?').run(id, ctx.senderId);
        return reply(ctx.sock, ctx.jid, result.changes ? `Deleted todo #${id}.` : 'Todo not found.', ctx.msg);
      }

      if (subcommand === 'clear') {
        const result = db.prepare('DELETE FROM todos WHERE user_id = ? AND completed = 1').run(ctx.senderId);
        return reply(ctx.sock, ctx.jid, result.changes ? `Cleared ${result.changes} completed todo(s).` : 'No completed todos to clear.', ctx.msg);
      }

      return reply(ctx.sock, ctx.jid, getUsage('todo', this.usage), ctx.msg);
    }
  },
  {
    name: 'note',
    category: 'Productivity',
    usage: '<add|list|view|edit|delete> ...',
    description: 'Manage personal notes',
    async execute(ctx) {
      const db = getDb();
      const subcommand = (ctx.args[0] || '').toLowerCase();
      if (!subcommand) return reply(ctx.sock, ctx.jid, getUsage('note', this.usage), ctx.msg);

      if (subcommand === 'add') {
        const [title, content] = parsePipeArgs(ctx.args.slice(1).join(' '));
        if (!title || !content) return reply(ctx.sock, ctx.jid, 'Use /note add Title | Content', ctx.msg);
        db.prepare('INSERT INTO notes (user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
          .run(ctx.senderId, title, content, Date.now(), Date.now());
        return reply(ctx.sock, ctx.jid, `Created note: ${title}`, ctx.msg);
      }

      if (subcommand === 'list') {
        const rows = db.prepare('SELECT id, title FROM notes WHERE user_id = ? ORDER BY updated_at DESC').all(ctx.senderId);
        if (rows.length === 0) return reply(ctx.sock, ctx.jid, 'You have no notes.', ctx.msg);
        return reply(ctx.sock, ctx.jid, `Your notes\n${rows.map((row) => `${row.id}. ${row.title}`).join('\n')}`, ctx.msg);
      }

      if (subcommand === 'view') {
        const id = Number(ctx.args[1]);
        if (Number.isNaN(id)) return reply(ctx.sock, ctx.jid, 'Provide a valid note id.', ctx.msg);
        const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, ctx.senderId);
        return reply(ctx.sock, ctx.jid, note ? `${note.title}\n\n${note.content}` : 'Note not found.', ctx.msg);
      }

      if (subcommand === 'edit') {
        const id = Number(ctx.args[1]);
        if (Number.isNaN(id)) return reply(ctx.sock, ctx.jid, 'Provide a valid note id.', ctx.msg);
        const existing = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, ctx.senderId);
        if (!existing) return reply(ctx.sock, ctx.jid, 'Note not found.', ctx.msg);
        const rest = ctx.args.slice(2).join(' ');
        const parts = rest.split('|').map((part) => part.trim());
        const nextTitle = parts[0] || existing.title;
        const nextContent = parts.length > 1 ? parts.slice(1).join(' | ') : existing.content;
        db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?')
          .run(nextTitle, nextContent, Date.now(), id, ctx.senderId);
        return reply(ctx.sock, ctx.jid, `Updated note #${id}.`, ctx.msg);
      }

      if (subcommand === 'delete') {
        const id = Number(ctx.args[1]);
        if (Number.isNaN(id)) return reply(ctx.sock, ctx.jid, 'Provide a valid note id.', ctx.msg);
        const result = db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, ctx.senderId);
        return reply(ctx.sock, ctx.jid, result.changes ? `Deleted note #${id}.` : 'Note not found.', ctx.msg);
      }

      return reply(ctx.sock, ctx.jid, getUsage('note', this.usage), ctx.msg);
    }
  },
  {
    name: 'birthday',
    category: 'Social',
    usage: '<set|view|remove|upcoming|today|setup> ...',
    description: 'Manage birthdays',
    async execute(ctx) {
      if (!groupOnly(ctx)) return;
      const db = getDb();
      const subcommand = (ctx.args[0] || '').toLowerCase();
      if (subcommand === 'set') {
        const day = Number(ctx.args[1]);
        const month = Number(ctx.args[2]);
        if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) {
          return reply(ctx.sock, ctx.jid, 'Use /birthday set <day> <month>', ctx.msg);
        }
        db.prepare('INSERT OR REPLACE INTO birthdays (user_id, chat_id, day, month) VALUES (?, ?, ?, ?)')
          .run(ctx.senderId, ctx.jid, day, month);
        return reply(ctx.sock, ctx.jid, `Birthday set to ${day}/${month}.`, ctx.msg);
      }
      if (subcommand === 'view' || subcommand === 'get') {
        const target = getMentionedJids(ctx.msg)[0] || ctx.senderId;
        const row = db.prepare('SELECT day, month FROM birthdays WHERE user_id = ? AND chat_id = ?').get(target, ctx.jid);
        if (!row) return reply(ctx.sock, ctx.jid, 'No birthday set for that user.', ctx.msg);
        return reply(ctx.sock, ctx.jid, `Birthday: ${MONTH_NAMES[row.month - 1]} ${row.day}`, ctx.msg);
      }
      if (subcommand === 'remove') {
        const result = db.prepare('DELETE FROM birthdays WHERE user_id = ? AND chat_id = ?').run(ctx.senderId, ctx.jid);
        return reply(ctx.sock, ctx.jid, result.changes ? 'Birthday removed.' : 'You did not have a birthday set.', ctx.msg);
      }
      if (subcommand === 'today') {
        const now = new Date();
        const rows = db.prepare('SELECT user_id FROM birthdays WHERE chat_id = ? AND day = ? AND month = ?').all(ctx.jid, now.getDate(), now.getMonth() + 1);
        return reply(ctx.sock, ctx.jid, rows.length ? `Today's birthdays:\n${rows.map((row) => row.user_id).join('\n')}` : 'No birthdays today.', ctx.msg);
      }
      if (subcommand === 'upcoming') {
        const rows = db.prepare('SELECT user_id, day, month FROM birthdays WHERE chat_id = ? ORDER BY month ASC, day ASC LIMIT 10').all(ctx.jid);
        if (rows.length === 0) return reply(ctx.sock, ctx.jid, 'No birthdays set yet.', ctx.msg);
        return reply(ctx.sock, ctx.jid, `Upcoming birthdays:\n${rows.map((row) => `${row.user_id} - ${MONTH_NAMES[row.month - 1]} ${row.day}`).join('\n')}`, ctx.msg);
      }
      if (subcommand === 'setup') {
        if (!await adminOnly(ctx)) return;
        const enabled = ['on', 'off'].includes((ctx.args[1] || '').toLowerCase()) ? ctx.args[1].toLowerCase() : 'on';
        db.prepare('INSERT OR REPLACE INTO group_settings (chat_id, key, value) VALUES (?, ?, ?)').run(ctx.jid, 'birthday_announcements', enabled === 'on' ? '1' : '0');
        return reply(ctx.sock, ctx.jid, `Birthday announcements ${enabled === 'on' ? 'enabled' : 'disabled'}.`, ctx.msg);
      }
      return reply(ctx.sock, ctx.jid, getUsage('birthday', this.usage), ctx.msg);
    }
  },
  {
    name: 'poll',
    category: 'Social',
    usage: '<question> | [option1] | [option2] [| ...] [--duration 10m]',
    description: 'Create a chat poll',
    async execute(ctx) {
      if (!groupOnly(ctx)) return;
      const durationMatch = ctx.argText.match(/\s+--duration\s+(\d+[smhd])$/i);
      const durationMs = durationMatch ? parseDuration(durationMatch[1]) : null;
      const raw = durationMatch ? ctx.argText.slice(0, durationMatch.index).trim() : ctx.argText;
      const parts = parsePipeArgs(raw);
      const question = parts[0];
      const options = parts.slice(1);
      if (!question) return reply(ctx.sock, ctx.jid, getUsage('poll', this.usage), ctx.msg);
      if (options.length === 1) return reply(ctx.sock, ctx.jid, 'Use at least 2 options or no options for a yes/no poll.', ctx.msg);
      const normalizedOptions = options.length ? options : ['Yes', 'No'];
      const pollMessage = await reply(
        ctx.sock,
        ctx.jid,
        `Poll #pending\n${question}\n${normalizedOptions.map((option, index) => `${index + 1}. ${option}`).join('\n')}\n\nVote with /vote <poll_id> <option_number>${durationMs ? `\nCloses in ${formatDuration(durationMs)}` : ''}`,
        ctx.msg
      );
      const result = getDb().prepare(
        'INSERT INTO polls (chat_id, creator_id, question, options_json, votes_json, closes_at, created_at, message_key_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        ctx.jid,
        ctx.senderId,
        question,
        JSON.stringify(normalizedOptions),
        JSON.stringify({}),
        durationMs ? Date.now() + durationMs : null,
        Date.now(),
        JSON.stringify(pollMessage.key)
      );
      await reply(ctx.sock, ctx.jid, `Created poll #${result.lastInsertRowid}. Vote with /vote ${result.lastInsertRowid} <option_number>.`, ctx.msg);
    }
  },
  {
    name: 'vote',
    category: 'Social',
    usage: '<poll_id> <option_number>',
    description: 'Vote in a poll',
    async execute(ctx) {
      const pollId = Number(ctx.args[0]);
      const optionNumber = Number(ctx.args[1]);
      if (Number.isNaN(pollId) || Number.isNaN(optionNumber)) return reply(ctx.sock, ctx.jid, getUsage('vote', this.usage), ctx.msg);
      const db = getDb();
      const poll = db.prepare('SELECT * FROM polls WHERE id = ? AND chat_id = ?').get(pollId, ctx.jid);
      if (!poll) return reply(ctx.sock, ctx.jid, 'Poll not found.', ctx.msg);
      if (poll.closed) return reply(ctx.sock, ctx.jid, 'That poll is already closed.', ctx.msg);
      const options = JSON.parse(poll.options_json);
      if (optionNumber < 1 || optionNumber > options.length) return reply(ctx.sock, ctx.jid, 'Invalid option number.', ctx.msg);
      const votes = JSON.parse(poll.votes_json || '{}');
      votes[ctx.senderId] = optionNumber - 1;
      db.prepare('UPDATE polls SET votes_json = ? WHERE id = ?').run(JSON.stringify(votes), pollId);
      return reply(ctx.sock, ctx.jid, `Vote recorded for "${options[optionNumber - 1]}".`, ctx.msg);
    }
  },
  {
    name: 'pollresult',
    category: 'Social',
    usage: '<poll_id>',
    description: 'Show poll results',
    async execute(ctx) {
      const pollId = Number(ctx.args[0]);
      if (Number.isNaN(pollId)) return reply(ctx.sock, ctx.jid, getUsage('pollresult', this.usage), ctx.msg);
      const poll = getDb().prepare('SELECT * FROM polls WHERE id = ? AND chat_id = ?').get(pollId, ctx.jid);
      if (!poll) return reply(ctx.sock, ctx.jid, 'Poll not found.', ctx.msg);
      const options = JSON.parse(poll.options_json);
      const votes = Object.values(JSON.parse(poll.votes_json || '{}'));
      const lines = options.map((option, index) => {
        const count = votes.filter((vote) => vote === index).length;
        return `${index + 1}. ${option} - ${count} vote(s)`;
      });
      return reply(ctx.sock, ctx.jid, `Poll #${pollId}: ${poll.question}\n${lines.join('\n')}\nStatus: ${poll.closed ? 'Closed' : 'Open'}`, ctx.msg);
    }
  },
  {
    name: 'giveaway',
    category: 'Social',
    usage: '<start|join|end|reroll|list> ...',
    description: 'Run simple giveaways',
    async execute(ctx) {
      if (!groupOnly(ctx)) return;
      const db = getDb();
      const subcommand = (ctx.args[0] || '').toLowerCase();
      if (subcommand === 'start') {
        if (!await adminOnly(ctx)) return;
        const duration = parseDuration(ctx.args[1]);
        const winnerCount = Number.isFinite(Number(ctx.args[2])) ? Math.max(1, Number(ctx.args[2])) : 1;
        const prizeStart = Number.isFinite(Number(ctx.args[2])) ? 3 : 2;
        const prize = ctx.args.slice(prizeStart).join(' ').trim();
        if (!duration || !prize) return reply(ctx.sock, ctx.jid, 'Use /giveaway start <duration> [winner_count] <prize>', ctx.msg);
        const result = db.prepare(
          'INSERT INTO giveaways (chat_id, creator_id, prize, closes_at, winner_count, participants_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(ctx.jid, ctx.senderId, prize, Date.now() + duration, winnerCount, JSON.stringify([]), Date.now());
        return reply(ctx.sock, ctx.jid, `Giveaway #${result.lastInsertRowid}: ${prize}\nJoin with /giveaway join ${result.lastInsertRowid}\nCloses in ${formatDuration(duration)}.`, ctx.msg);
      }
      if (subcommand === 'join') {
        const id = Number(ctx.args[1]);
        if (Number.isNaN(id)) return reply(ctx.sock, ctx.jid, 'Use /giveaway join <id>', ctx.msg);
        const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ? AND chat_id = ?').get(id, ctx.jid);
        if (!giveaway) return reply(ctx.sock, ctx.jid, 'Giveaway not found.', ctx.msg);
        if (giveaway.closed) return reply(ctx.sock, ctx.jid, 'That giveaway has ended.', ctx.msg);
        const participants = [...new Set(JSON.parse(giveaway.participants_json || '[]').concat(ctx.senderId))];
        db.prepare('UPDATE giveaways SET participants_json = ? WHERE id = ?').run(JSON.stringify(participants), id);
        return reply(ctx.sock, ctx.jid, `You joined giveaway #${id}.`, ctx.msg);
      }
      if (subcommand === 'end' || subcommand === 'reroll') {
        if (!await adminOnly(ctx)) return;
        const id = Number(ctx.args[1]);
        if (Number.isNaN(id)) return reply(ctx.sock, ctx.jid, 'Provide a giveaway id.', ctx.msg);
        const giveaway = db.prepare('SELECT * FROM giveaways WHERE id = ? AND chat_id = ?').get(id, ctx.jid);
        if (!giveaway) return reply(ctx.sock, ctx.jid, 'Giveaway not found.', ctx.msg);
        const participants = JSON.parse(giveaway.participants_json || '[]');
        if (participants.length === 0) return reply(ctx.sock, ctx.jid, 'No giveaway entries yet.', ctx.msg);
        const shuffled = [...participants];
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const winners = shuffled.slice(0, Math.min(giveaway.winner_count, shuffled.length));
        db.prepare('UPDATE giveaways SET winners_json = ?, closed = 1 WHERE id = ?').run(JSON.stringify(winners), id);
        return reply(ctx.sock, ctx.jid, `Winners for giveaway #${id} (${giveaway.prize}):\n${winners.join('\n')}`, ctx.msg);
      }
      if (subcommand === 'list') {
        const rows = db.prepare('SELECT id, prize, closes_at, closed FROM giveaways WHERE chat_id = ? ORDER BY created_at DESC LIMIT 10').all(ctx.jid);
        if (rows.length === 0) return reply(ctx.sock, ctx.jid, 'No giveaways found.', ctx.msg);
        return reply(ctx.sock, ctx.jid, `Giveaways\n${rows.map((row) => `#${row.id} ${row.prize} - ${row.closed ? 'closed' : `ends in ${formatDuration(row.closes_at - Date.now())}`}`).join('\n')}`, ctx.msg);
      }
      return reply(ctx.sock, ctx.jid, getUsage('giveaway', this.usage), ctx.msg);
    }
  },
  {
    name: 'confession',
    category: 'Social',
    usage: '<send|setup|toggle|status> ...',
    description: 'Anonymous confessions for groups',
    async execute(ctx) {
      if (!groupOnly(ctx)) return;
      const db = getDb();
      const subcommand = (ctx.args[0] || '').toLowerCase();
      const target = db.prepare('SELECT value FROM group_settings WHERE chat_id = ? AND key = ?').get(ctx.jid, 'confession_target_chat');
      const enabled = db.prepare('SELECT value FROM group_settings WHERE chat_id = ? AND key = ?').get(ctx.jid, 'confession_enabled');
      if (subcommand === 'setup') {
        if (!await adminOnly(ctx)) return;
        const targetChatId = ctx.args[1];
        if (!targetChatId) return reply(ctx.sock, ctx.jid, 'Use /confession setup <target_group_jid>', ctx.msg);
        db.prepare('INSERT OR REPLACE INTO group_settings (chat_id, key, value) VALUES (?, ?, ?)').run(ctx.jid, 'confession_target_chat', targetChatId);
        db.prepare('INSERT OR REPLACE INTO group_settings (chat_id, key, value) VALUES (?, ?, ?)').run(ctx.jid, 'confession_enabled', '1');
        return reply(ctx.sock, ctx.jid, `Confessions will be relayed to ${targetChatId}.`, ctx.msg);
      }
      if (subcommand === 'toggle') {
        if (!await adminOnly(ctx)) return;
        const value = ['on', 'off'].includes((ctx.args[1] || '').toLowerCase()) ? ctx.args[1].toLowerCase() : null;
        if (!value) return reply(ctx.sock, ctx.jid, 'Use /confession toggle <on|off>', ctx.msg);
        db.prepare('INSERT OR REPLACE INTO group_settings (chat_id, key, value) VALUES (?, ?, ?)').run(ctx.jid, 'confession_enabled', value === 'on' ? '1' : '0');
        return reply(ctx.sock, ctx.jid, `Confessions ${value === 'on' ? 'enabled' : 'disabled'}.`, ctx.msg);
      }
      if (subcommand === 'status') {
        return reply(ctx.sock, ctx.jid, `Confessions: ${enabled?.value === '1' ? 'enabled' : 'disabled'}\nTarget: ${target?.value || 'not configured'}`, ctx.msg);
      }
      const message = subcommand === 'send' ? ctx.args.slice(1).join(' ').trim() : ctx.argText.trim();
      if (!message) return reply(ctx.sock, ctx.jid, 'Use /confession send <message>', ctx.msg);
      if (enabled?.value === '0') return reply(ctx.sock, ctx.jid, 'Confessions are disabled here.', ctx.msg);
      if (!target?.value) return reply(ctx.sock, ctx.jid, 'Confession target is not configured.', ctx.msg);
      db.prepare('INSERT INTO confessions (source_chat_id, target_chat_id, message, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(ctx.jid, target.value, message, ctx.senderId, Date.now());
      await ctx.sock.sendMessage(target.value, { text: `Anonymous confession:\n\n${message}` });
      return reply(ctx.sock, ctx.jid, 'Confession sent.', ctx.msg);
    }
  },
  {
    name: 'trivia',
    category: 'Fun',
    usage: '[category] [difficulty]',
    description: 'Start a trivia round',
    async execute(ctx) {
      if (!groupOnly(ctx)) return;
      const category = (ctx.args[0] || '').toLowerCase();
      const difficulty = (ctx.args[1] || '').toLowerCase();
      const question = await fetchTriviaQuestion(category, difficulty);
      const result = getDb().prepare(
        'INSERT INTO trivia_games (chat_id, creator_id, question, options_json, correct_answer, closes_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(ctx.jid, ctx.senderId, question.question, JSON.stringify(question.options), question.correctAnswer, Date.now() + 30_000, Date.now());
      await reply(
        ctx.sock,
        ctx.jid,
        `Trivia #${result.lastInsertRowid}\nCategory: ${question.category}\nDifficulty: ${question.difficulty}\n\n${question.question}\n${question.options.map((option, index) => `${String.fromCharCode(65 + index)}. ${option}`).join('\n')}\n\nAnswer with /answer ${result.lastInsertRowid} <A-D> within 30 seconds.`,
        ctx.msg
      );
    }
  },
  {
    name: 'answer',
    category: 'Fun',
    usage: '<trivia_id> <A-D>',
    description: 'Answer a trivia round',
    async execute(ctx) {
      const id = Number(ctx.args[0]);
      const answerLetter = (ctx.args[1] || '').toUpperCase();
      if (Number.isNaN(id) || !['A', 'B', 'C', 'D'].includes(answerLetter)) return reply(ctx.sock, ctx.jid, getUsage('answer', this.usage), ctx.msg);
      const trivia = getDb().prepare('SELECT * FROM trivia_games WHERE id = ? AND chat_id = ?').get(id, ctx.jid);
      if (!trivia) return reply(ctx.sock, ctx.jid, 'Trivia round not found.', ctx.msg);
      const options = JSON.parse(trivia.options_json);
      const chosen = options[answerLetter.charCodeAt(0) - 65];
      return reply(ctx.sock, ctx.jid, chosen === trivia.correct_answer ? 'Correct.' : `Locked in: ${chosen}`, ctx.msg);
    }
  },
  {
    name: 'autoresponder',
    category: 'Automation',
    usage: '<add|remove|list> ...',
    description: 'Manage group autoresponders',
    async execute(ctx) {
      if (!groupOnly(ctx)) return;
      const db = getDb();
      const subcommand = (ctx.args[0] || '').toLowerCase();
      if (subcommand === 'add') {
        if (!await adminOnly(ctx)) return;
        const [triggerText, responseText, matchType = 'contains'] = parsePipeArgs(ctx.args.slice(1).join(' '));
        if (!triggerText || !responseText) return reply(ctx.sock, ctx.jid, 'Use /autoresponder add trigger | response | [contains|exact|startswith]', ctx.msg);
        db.prepare(
          'INSERT INTO autoresponders (chat_id, trigger_text, response_text, match_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(ctx.jid, triggerText.toLowerCase(), responseText, matchType, ctx.senderId, Date.now());
        return reply(ctx.sock, ctx.jid, `Added autoresponder for "${triggerText}".`, ctx.msg);
      }
      if (subcommand === 'remove') {
        if (!await adminOnly(ctx)) return;
        const id = Number(ctx.args[1]);
        if (Number.isNaN(id)) return reply(ctx.sock, ctx.jid, 'Use /autoresponder remove <id>', ctx.msg);
        const result = db.prepare('DELETE FROM autoresponders WHERE id = ? AND chat_id = ?').run(id, ctx.jid);
        return reply(ctx.sock, ctx.jid, result.changes ? `Removed autoresponder #${id}.` : 'Autoresponder not found.', ctx.msg);
      }
      const rows = db.prepare('SELECT id, trigger_text, response_text, match_type FROM autoresponders WHERE chat_id = ? ORDER BY created_at DESC').all(ctx.jid);
      return reply(ctx.sock, ctx.jid, rows.length ? `Autoresponders\n${rows.map((row) => `#${row.id} ${row.match_type} "${row.trigger_text}" -> ${row.response_text.slice(0, 50)}`).join('\n')}` : 'No autoresponders configured.', ctx.msg);
    }
  },
  {
    name: 'welcomer',
    category: 'Automation',
    usage: '<setup|enable|disable|test|status> [message]',
    description: 'Configure group welcome messages',
    async execute(ctx) {
      if (!groupOnly(ctx)) return;
      const db = getDb();
      const subcommand = (ctx.args[0] || '').toLowerCase();
      if (['setup', 'enable', 'disable', 'test'].includes(subcommand) && !await ctx.getIsAdmin()) return reply(ctx.sock, ctx.jid, 'Only group admins can manage the welcomer.', ctx.msg);
      if (subcommand === 'setup') {
        const message = ctx.args.slice(1).join(' ').trim() || 'Welcome, {user}.';
        db.prepare('INSERT OR REPLACE INTO group_settings (chat_id, key, value) VALUES (?, ?, ?)').run(ctx.jid, 'welcome_enabled', '1');
        db.prepare('INSERT OR REPLACE INTO group_settings (chat_id, key, value) VALUES (?, ?, ?)').run(ctx.jid, 'welcome_message', message);
        return reply(ctx.sock, ctx.jid, `Welcomer configured.\nTemplate: ${message}`, ctx.msg);
      }
      if (subcommand === 'enable' || subcommand === 'disable') {
        db.prepare('INSERT OR REPLACE INTO group_settings (chat_id, key, value) VALUES (?, ?, ?)').run(ctx.jid, 'welcome_enabled', subcommand === 'enable' ? '1' : '0');
        return reply(ctx.sock, ctx.jid, `Welcome messages ${subcommand}d.`, ctx.msg);
      }
      if (subcommand === 'test') {
        const row = db.prepare('SELECT value FROM group_settings WHERE chat_id = ? AND key = ?').get(ctx.jid, 'welcome_message');
        const text = (row?.value || 'Welcome, {user}.').replaceAll('{user}', ctx.senderId).replaceAll('{group}', ctx.jid);
        await ctx.sock.sendMessage(ctx.jid, { text: `(Test) ${text}` }, { quoted: ctx.msg });
        return;
      }
      const enabled = db.prepare('SELECT value FROM group_settings WHERE chat_id = ? AND key = ?').get(ctx.jid, 'welcome_enabled');
      const message = db.prepare('SELECT value FROM group_settings WHERE chat_id = ? AND key = ?').get(ctx.jid, 'welcome_message');
      return reply(ctx.sock, ctx.jid, `Welcomer: ${enabled?.value === '1' ? 'enabled' : 'disabled'}\nTemplate: ${message?.value || 'Welcome, {user}.'}`, ctx.msg);
    }
  }
];

const commandMap = new Map(commands.map((command) => [command.name, command]));

export function getCommand(name) {
  return commandMap.get(name);
}
