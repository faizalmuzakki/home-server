-- Collapse the categories the Notion/xlsx backfills created onto the app's own set.
-- Only merges where the imported name is the same concept under a different label;
-- Needs / Optional / Extra Expenses are budget buckets with no app equivalent and stay.
-- Income categories are deliberately untouched (collapsing Paycheck Icha/Faizal into
-- Salary would throw away the per-person split).
BEGIN;

CREATE TEMP TABLE merge(src TEXT, dst TEXT);
INSERT INTO merge VALUES
  ('Kebutuhan',            'Needs'),              -- same concept, Notion spelt it in Indonesian
  ('Optional Icha',        'Optional'),
  ('Optional Faizal',      'Optional'),
  ('Bills',                'Bills & Utilities'),
  ('Installment',          'Bills & Utilities'),
  ('Gasoline - Car',       'Transportation'),
  ('Gasoline - Motorcycle','Transportation'),
  ('Car maintenance',      'Transportation'),
  ('Motor maintenance',    'Transportation'),
  ('Investment Faizal',    'Investment'),
  ('Investment Icha',      'Investment'),
  ('Healing',              'Entertainment'),      -- leisure outings
  ('Healing Tahunan',      'Travel'),             -- the annual/bigger trips
  ('Rekreasi Tahunan',     'Travel');

UPDATE expenses SET category_id = (
    SELECT d.id FROM merge m JOIN categories d ON d.name = m.dst
    JOIN categories s ON s.name = m.src WHERE s.id = expenses.category_id)
WHERE category_id IN (SELECT s.id FROM merge m JOIN categories s ON s.name = m.src);

DELETE FROM categories WHERE name IN (SELECT src FROM merge)
  AND id NOT IN (SELECT category_id FROM expenses WHERE category_id IS NOT NULL);

-- The 28 rows whose spreadsheet category cell was blank; parked in Other on import.
-- Nearly all are one untracked outing: Bromo / Coban Talun, 15-20 Oct 2024.
CREATE TEMP TABLE blanks AS
  SELECT id, date, description FROM expenses
  WHERE source = 'xlsx' AND category_id = (SELECT id FROM categories WHERE name = 'Other');

UPDATE expenses SET category_id = (SELECT id FROM categories WHERE name = 'Shopping')
WHERE id IN (SELECT id FROM blanks WHERE description IN
  ('MacBook M1 pro second', 'Beli Iphone 15 - Jual iphone 13', 'Celana panjang brodo'));

UPDATE expenses SET category_id = (SELECT id FROM categories WHERE name = 'Bills & Utilities')
WHERE id IN (SELECT id FROM blanks WHERE description IN ('Google one', 'iCloud'));

UPDATE expenses SET category_id = (SELECT id FROM categories WHERE name = 'Food & Dining')
WHERE id IN (SELECT id FROM blanks WHERE date = '2025-01-19');

UPDATE expenses SET category_id = (SELECT id FROM categories WHERE name = 'Travel')
WHERE id IN (SELECT id FROM blanks WHERE date BETWEEN '2024-10-16' AND '2024-10-20');

COMMIT;
