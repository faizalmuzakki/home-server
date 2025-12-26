import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/init.js';

const router = Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Helper to clean markdown code blocks from JSON response
function cleanJsonResponse(text) {
  // Remove ```json and ``` wrappers
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

// Parse expense or income from text
router.post('/text', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const expenseCategories = db.prepare("SELECT id, name FROM categories WHERE type = 'expense'").all();
    const incomeCategories = db.prepare("SELECT id, name FROM categories WHERE type = 'income'").all();

    const expenseCategoryList = expenseCategories.map(c => `${c.id}: ${c.name}`).join('\n');
    const incomeCategoryList = incomeCategories.map(c => `${c.id}: ${c.name}`).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Analyze this text and determine if it's an EXPENSE (money spent) or INCOME (money received).

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

If you cannot extract transaction info, return: {"error": "reason"}`
      }]
    });

    const content = response.content[0].text;
    const parsed = JSON.parse(cleanJsonResponse(content));

    // Add token usage for cost tracking
    parsed.usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens
    };

    res.json(parsed);
  } catch (error) {
    console.error('Parse text error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Parse expense or income from image (receipt/transfer proof)
router.post('/image', async (req, res) => {
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
            text: `Analyze this image and determine if it shows an EXPENSE (receipt, purchase, payment) or INCOME (transfer received, salary slip, payment received).

EXPENSE indicators: Receipt, invoice, purchase, payment confirmation, bill, struk, nota
INCOME indicators: Transfer received, salary slip, payment received, "dari", incoming transfer, credit notification

EXPENSE categories:
${expenseCategoryList}

INCOME categories:
${incomeCategoryList}

Return ONLY valid JSON:
{
  "type": "expense" or "income",
  "amount": <number - total amount>,
  "description": "<brief description>",
  "vendor": "<store/sender name>",
  "category_id": <number from appropriate category list above>,
  "date": "<YYYY-MM-DD from image, or today: ${new Date().toISOString().split('T')[0]}>",
  "items": ["<item1>", "<item2>"],
  "confidence": <0-1 how confident you are>
}

If this is not a valid transaction image (e.g., order tracking, shopping cart, unrelated image), return: {"error": "reason"}`
          }
        ]
      }]
    });

    const content = response.content[0].text;
    const parsed = JSON.parse(cleanJsonResponse(content));

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
