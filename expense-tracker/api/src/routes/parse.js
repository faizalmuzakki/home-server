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

// Parse expense from text
router.post('/text', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const categories = db.prepare('SELECT id, name FROM categories').all();
    const categoryList = categories.map(c => `${c.id}: ${c.name}`).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Extract expense information from this text. Return ONLY valid JSON, no other text.

Text: "${text}"

Available categories:
${categoryList}

Return JSON format:
{
  "amount": <number>,
  "description": "<string>",
  "vendor": "<string or null>",
  "category_id": <number from list above>,
  "date": "<YYYY-MM-DD, use today if not specified: ${new Date().toISOString().split('T')[0]}>",
  "confidence": <0-1 how confident you are>
}

If you cannot extract expense info, return: {"error": "reason"}`
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

// Parse expense from image (receipt)
router.post('/image', async (req, res) => {
  try {
    const { image } = req.body; // base64 encoded image

    if (!image) {
      return res.status(400).json({ error: 'Image is required (base64)' });
    }

    const categories = db.prepare('SELECT id, name FROM categories').all();
    const categoryList = categories.map(c => `${c.id}: ${c.name}`).join('\n');

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
            text: `Extract expense information from this receipt/image. Return ONLY valid JSON, no other text.

Available categories:
${categoryList}

Return JSON format:
{
  "amount": <number - total amount paid>,
  "description": "<brief description of purchase>",
  "vendor": "<store/restaurant name>",
  "category_id": <number from list above>,
  "date": "<YYYY-MM-DD from receipt, or today: ${new Date().toISOString().split('T')[0]}>",
  "items": ["<item1>", "<item2>"],
  "confidence": <0-1 how confident you are>
}

If you cannot extract expense info, return: {"error": "reason"}`
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
