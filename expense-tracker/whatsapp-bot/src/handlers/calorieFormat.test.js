import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFoodReply, formatTodaySummary } from './calorieFormat.js';

test('formatFoodReply renders name, kcal, macros, items, cost', () => {
  const text = formatFoodReply({
    name: 'Faizal',
    parsed: {
      calories: 650, protein_g: 28, carbs_g: 72, fat_g: 24,
      items: [
        { name: 'Nasi goreng', calories: 450 },
        { name: 'Fried egg', calories: 90 }
      ],
      confidence: 0.7,
      usage: { input_tokens: 1450, output_tokens: 180 }
    }
  });
  assert.match(text, /Logged for Faizal/);
  assert.match(text, /650 kcal/);
  assert.match(text, /P 28g · C 72g · F 24g/);
  assert.match(text, /Nasi goreng \(~450\)/);
  assert.match(text, /Confidence 70%/);
  assert.match(text, /Tokens 1450\/180/);
});

test('formatFoodReply tolerates missing macros and items', () => {
  const text = formatFoodReply({ name: '', parsed: { calories: 300 } });
  assert.match(text, /Logged/);
  assert.match(text, /300 kcal/);
});

test('formatTodaySummary renders per-sender total or empty message', () => {
  assert.match(formatTodaySummary(null), /No food logged today/);
  const text = formatTodaySummary({
    sender_name: 'Faizal',
    total_calories: 1450, total_protein_g: 60, total_carbs_g: 150, total_fat_g: 48,
    entry_count: 3
  });
  assert.match(text, /Faizal/);
  assert.match(text, /1450 kcal/);
  assert.match(text, /3 meal/);
});
