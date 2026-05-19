// Data-access module for calorie entries. Every function takes a better-sqlite3
// `db` handle so the same code serves the live DB and in-memory test DBs.

export function initCalorieSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calorie_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id   TEXT NOT NULL,
      sender_name TEXT,
      description TEXT,
      calories    INTEGER NOT NULL,
      protein_g   REAL,
      carbs_g     REAL,
      fat_g       REAL,
      items       TEXT,
      confidence  REAL,
      image_url   TEXT,
      date        DATE NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_calorie_sender ON calorie_entries(sender_id);
    CREATE INDEX IF NOT EXISTS idx_calorie_date   ON calorie_entries(date);
  `);
}

export function insertCalorieEntry(db, entry) {
  const itemsJson = entry.items == null ? null : JSON.stringify(entry.items);
  const info = db.prepare(`
    INSERT INTO calorie_entries
      (sender_id, sender_name, description, calories, protein_g, carbs_g,
       fat_g, items, confidence, image_url, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.sender_id,
    entry.sender_name ?? null,
    entry.description ?? null,
    Math.round(entry.calories),
    entry.protein_g ?? null,
    entry.carbs_g ?? null,
    entry.fat_g ?? null,
    itemsJson,
    entry.confidence ?? null,
    entry.image_url ?? null,
    entry.date
  );
  return db.prepare('SELECT * FROM calorie_entries WHERE id = ?').get(info.lastInsertRowid);
}

function dateRangeClause({ sender_id, startDate, endDate }) {
  let where = ' WHERE 1=1';
  const params = [];
  if (sender_id) { where += ' AND sender_id = ?'; params.push(sender_id); }
  if (startDate) { where += ' AND DATE(date) >= DATE(?)'; params.push(startDate); }
  if (endDate)   { where += ' AND DATE(date) <= DATE(?)'; params.push(endDate); }
  return { where, params };
}

export function listCalorieEntries(db, filters = {}) {
  const { where, params } = dateRangeClause(filters);
  const limit = Number.isFinite(+filters.limit) ? +filters.limit : 100;
  return db.prepare(
    `SELECT * FROM calorie_entries${where} ORDER BY DATE(date) DESC, created_at DESC LIMIT ?`
  ).all(...params, limit);
}

export function calorieSummary(db, filters = {}) {
  const { where, params } = dateRangeClause(filters);
  return db.prepare(`
    SELECT
      sender_id,
      MAX(sender_name) AS sender_name,
      COALESCE(SUM(calories), 0)  AS total_calories,
      COALESCE(SUM(protein_g), 0) AS total_protein_g,
      COALESCE(SUM(carbs_g), 0)   AS total_carbs_g,
      COALESCE(SUM(fat_g), 0)     AS total_fat_g,
      COUNT(*) AS entry_count
    FROM calorie_entries${where}
    GROUP BY sender_id
    ORDER BY total_calories DESC
  `).all(...params);
}
