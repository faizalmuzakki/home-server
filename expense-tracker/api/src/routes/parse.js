import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/init.js';
import { parseTextValidators, parseImageValidators, sanitizeBase64Image } from '../middleware/validators.js';

const router = Router();

// Claude API service for text parsing (uses Max subscription)
const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'http://claude-api:3100';
const CLAUDE_API_SECRET = process.env.CLAUDE_API_SECRET;

const JSON_ONLY_SYSTEM_PROMPT = 'Respond with ONLY a single raw JSON object matching the schema in the user message. No prose before or after. No markdown fences. No commentary.';

async function askClaude(prompt) {
  const res = await fetch(`${CLAUDE_API_URL}/api/prompt`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CLAUDE_API_SECRET}`,
    },
    body: JSON.stringify({ prompt, maxTurns: 1, systemPrompt: JSON_ONLY_SYSTEM_PROMPT }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Claude API returned ${res.status}`);
  }
  const data = await res.json();
  if (data.result?.result) return data.result.result;
  if (typeof data.result === 'string') return data.result;
  throw new Error('Unexpected response format from Claude API');
}

// Keep Anthropic SDK for image parsing (multimodal not supported via CLI)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Extract the first balanced JSON object from a response. Tolerates prose
// preamble/suffix and markdown code fences — the model occasionally ignores
// "return only JSON" and wraps the object in commentary.
function extractJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) throw new Error(`no JSON object in response: ${text.slice(0, 120)}`);

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced JSON in response: ${text.slice(start, start + 120)}`);
}

// Parse expense or income from text
router.post('/text', parseTextValidators, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const expenseCategories = db.prepare("SELECT id, name FROM categories WHERE type = 'expense'").all();
    const incomeCategories = db.prepare("SELECT id, name FROM categories WHERE type = 'income'").all();

    const expenseCategoryList = expenseCategories.map(c => `${c.id}: ${c.name}`).join('\n');
    const incomeCategoryList = incomeCategories.map(c => `${c.id}: ${c.name}`).join('\n');

    const content = await askClaude(`Analyze this text and determine if it's an EXPENSE (money spent) or INCOME (money received).

Text: "${text}"

INCOME indicators: received, got paid, salary, gaji, terima, dapat, income, freelance, transfer masuk, refund, cashback, bonus, commission, dividend
EXPENSE indicators: bought, paid, spent, beli, bayar, lunch, dinner, grab, gojek, shopping, bill, groceries

EXPENSE categories:
${expenseCategoryList}

INCOME categories:
${incomeCategoryList}

Return ONLY valid JSON:
{
  "type": "expense" or "income",
  "amount": <number>,
  "description": "<string>",
  "vendor": "<string or null>",
  "category_id": <number from appropriate category list above>,
  "date": "<YYYY-MM-DD, use today if not specified: ${new Date().toISOString().split('T')[0]}>",
  "confidence": <0-1 how confident you are>
}

If you cannot extract transaction info, return: {"error": "reason"}`);

    const parsed = JSON.parse(extractJsonObject(content));
    res.json(parsed);
  } catch (error) {
    console.error('Parse text error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Parse expense or income from image (receipt/transfer proof)
router.post('/image', sanitizeBase64Image, parseImageValidators, async (req, res) => {
  try {
    const { image } = req.body; // base64 encoded image

    if (!image) {
      return res.status(400).json({ error: 'Image is required (base64)' });
    }

    const expenseCategories = db.prepare("SELECT id, name FROM categories WHERE type = 'expense'").all();
    const incomeCategories = db.prepare("SELECT id, name FROM categories WHERE type = 'income'").all();

    const expenseCategoryList = expenseCategories.map(c => `${c.id}: ${c.name}`).join('\n');
    const incomeCategoryList = incomeCategories.map(c => `${c.id}: ${c.name}`).join('\n');

    // Detect media type from base64 header or default to jpeg
    let mediaType = 'image/jpeg';
    if (image.startsWith('/9j/')) mediaType = 'image/jpeg';
    else if (image.startsWith('iVBOR')) mediaType = 'image/png';
    else if (image.startsWith('R0lGOD')) mediaType = 'image/gif';
    else if (image.startsWith('UklGR')) mediaType = 'image/webp';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: image,
            },
          },
          {
            type: 'text',
            text: `First classify this image, then extract data.

Set "kind" to:
- "expense" if it is a receipt, invoice, bill, purchase, or payment/transfer proof (money spent or received)
- "food" if it is a photo of food or a meal/drink to estimate nutrition for
- "unknown" if it is neither (e.g. screenshot, person, scenery, order tracking)

EXPENSE categories:
${expenseCategoryList}

INCOME categories:
${incomeCategoryList}

If kind is "expense", return ONLY this JSON:
{
  "kind": "expense",
  "type": "expense" or "income",
  "amount": <number - total amount>,
  "description": "<brief description>",
  "vendor": "<store/sender name>",
  "category_id": <number from the appropriate category list above>,
  "date": "<YYYY-MM-DD from image, or today: ${new Date().toISOString().split('T')[0]}>",
  "items": ["<item1>", "<item2>"],
  "confidence": <0-1>
}

If kind is "food", estimate nutrition and return ONLY this JSON:
{
  "kind": "food",
  "description": "<short description of the meal, e.g. 'Nasi goreng + telur + es teh'>",
  "calories": <integer total kcal estimate>,
  "protein_g": <number grams>,
  "carbs_g": <number grams>,
  "fat_g": <number grams>,
  "items": [{"name": "<food>", "calories": <integer>, "portion": "<e.g. 1 plate>"}],
  "date": "${new Date().toISOString().split('T')[0]}",
  "confidence": <0-1>
}

If kind is "unknown", return ONLY: {"kind": "unknown", "reason": "<short reason>"}`
          }
        ]
      }]
    });

    const content = response.content[0].text;
    const parsed = JSON.parse(extractJsonObject(content));

    // Backward compat: older prompt versions / receipts without an explicit
    // discriminator are treated as expenses.
    if (!parsed.kind && !parsed.error) parsed.kind = 'expense';

    // Add token usage for cost tracking
    parsed.usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens
    };

    res.json(parsed);
  } catch (error) {
    console.error('Parse image error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
