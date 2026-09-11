// One-shot backfill of the old Notion "Expenses" database into the local SQLite db.
// Usage: node import-notion.js <export.csv>
// Notion: open the Expenses database -> ••• -> Export -> Markdown & CSV, no subpages.
// Idempotent: rows are tagged source='notion' and skipped if an identical one exists.
// Undo:  sqlite3 data/expenses.db "delete from expenses where source='notion'"
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import path from 'path';

const csvPath = process.argv[2];
if (!csvPath) { console.error('usage: node import-notion.js <export.csv>'); process.exit(1); }

const db = new Database(process.env.DB_PATH || path.join(import.meta.dirname, 'data/expenses.db'));

// Notion category name -> existing local category name. Anything unlisted is created verbatim.
const CATEGORY_MAP = {
  'Rekreasi': 'Entertainment',
  'Lain-lain': 'Other',
  'Zakat & Sedekah': 'Sedekah/Zakat',
  'Skincare & Bodycare': 'Skincare Bodycare',
  'Mpus': 'Meow',
  'Kesehatan': 'Healthcare',
  'Rumah': 'Housing ',
  'Self Development': 'Self Improvement',
  'byMuss': 'Bymuss',
  'Investment': 'Investment',
};

// ponytail: minimal RFC4180 reader; Notion quotes any field containing , " or newline.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
const header = rows.shift().map(h => h.trim());
const col = name => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error(`CSV is missing a "${name}" column; got: ${header.join(', ')}`);
  return i;
};
const [iName, iAmount, iDate, iNotes, iCategory] = ['Name', 'Amount', 'Date', 'Notes', 'Category'].map(col);

const findCat = db.prepare('SELECT id FROM categories WHERE name = ?');
const insertCat = db.prepare("INSERT INTO categories (name, type, icon, color) VALUES (?, 'expense', '\u{1F3F7}\u{FE0F}', ?)");
// A category with a null colour blanks the dashboard: it feeds category.color straight
// into a recharts <Cell fill>, which calls .includes() on it and unmounts the tree.
const FALLBACK_COLORS = ['#6366F1', '#EC4899', '#0EA5E9', '#F59E0B', '#8B5CF6', '#D946EF', '#059669', '#14B8A6'];
let colorSeq = 0;
const catCache = new Map();
function categoryId(notionName) {
  // CSV renders a relation as "Category Name (https://app.notion.com/p/...)".
  const raw = (notionName || '').replace(/\s*\(https?:\/\/[^)]*\)/g, '').split(',')[0].trim();
  if (!raw) return null;
  if (catCache.has(raw)) return catCache.get(raw);
  const local = CATEGORY_MAP[raw] || raw;
  const id = findCat.get(local)?.id
    ?? insertCat.run(local, FALLBACK_COLORS[colorSeq++ % FALLBACK_COLORS.length]).lastInsertRowid;
  catCache.set(raw, id);
  return id;
}

const exists = db.prepare(
  "SELECT 1 FROM expenses WHERE source='notion' AND date=? AND amount=? AND description IS ?"
);
const insert = db.prepare(
  "INSERT INTO expenses (amount, description, category_id, date, type, source, raw_text)" +
  " VALUES (?, ?, ?, ?, 'expense', 'notion', ?)"
);

// Notion writes dates like "January 19, 2024"; SQLite wants ISO.
// Never round-trip through toISOString(): "January 19, 2024" parses as LOCAL midnight,
// which UTC-shifts back to the 18th in WIB. Read back local components instead.
function isoDate(s) {
  s = (s || '').trim();
  const already = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (already) return already[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const p2 = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

let inserted = 0, skippedNoDate = 0, skippedNoAmount = 0, dupes = 0;
const run = db.transaction(() => {
  for (const r of rows) {
    if (!r[iName] && !r[iAmount] && !r[iDate]) continue; // trailing blank line
    const date = isoDate(r[iDate]);
    if (!date) { skippedNoDate++; continue; }        // date is NOT NULL locally
    const amount = parseFloat((r[iAmount] || '').replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(amount)) { skippedNoAmount++; continue; }
    const description = r[iName]?.trim() || null;
    if (exists.get(date, amount, description)) { dupes++; continue; }
    insert.run(amount, description, categoryId(r[iCategory]), date, r[iNotes]?.trim() || null);
    inserted++;
  }
});
run();

console.log({ inserted, dupes, skippedNoDate, skippedNoAmount });
console.log('new categories:', [...catCache.keys()].filter(k => !CATEGORY_MAP[k]).join(', ') || 'none');
