import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful assistant in a WhatsApp group chat. Answer questions concisely and clearly.
Keep your responses short and to the point — ideally under 300 words since this is a chat message.
Use simple formatting (no markdown headers, just plain text with line breaks and emojis where appropriate).
If you don't know something, say so honestly.
Respond in the same language as the question.`;

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

async function runPrompt(system, prompt, maxTokens = 1024) {
  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{
      role: 'user',
      content: prompt,
    }],
  });

  return {
    text: response.content[0].text,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    }
  };
}

export async function askQuestion(question) {
  const response = await runPrompt(SYSTEM_PROMPT, question, 1024);

  return {
    answer: response.text,
    usage: response.usage,
  };
}

export async function summarizeText(input, style = 'bullets') {
  const styleInstructions = {
    bullets: 'Summarize in 3-5 short bullet points.',
    sentence: 'Summarize in exactly one sentence.',
    paragraph: 'Summarize in 2-3 short sentences.',
    takeaways: 'List 3-5 key takeaways.'
  };

  return runPrompt(
    'You are excellent at concise summarization for chat apps.',
    `${styleInstructions[style] || styleInstructions.bullets}\n\nContent:\n${input}`,
    700
  );
}

export async function explainTopic(topic, level = 'beginner') {
  const levels = {
    eli5: "Explain like I'm 5. Use very simple words and one concrete example.",
    beginner: 'Explain for a beginner with minimal jargon.',
    intermediate: 'Explain for someone with some prior knowledge.',
    advanced: 'Explain with technical depth and nuance.',
    expert: 'Explain for an expert audience with precision.'
  };

  return runPrompt(
    'You are an expert teacher. Keep answers structured and concise for chat.',
    `${levels[level] || levels.beginner}\n\nTopic: ${topic}`,
    1000
  );
}

export async function translateText(targetLanguage, text, sourceLanguage = 'auto') {
  const prompt = sourceLanguage === 'auto'
    ? `Detect the source language, then translate the text to ${targetLanguage}.\nRespond in this format:\nDetected language: <language>\nTranslation: <translated text>\n\nText:\n${text}`
    : `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Respond only with the translation.\n\nText:\n${text}`;

  return runPrompt(
    'You are a professional translator. Preserve tone and meaning.',
    prompt,
    900
  );
}

export async function recapMessages(messages, hours) {
  return runPrompt(
    'You write concise, useful chat recaps with action items when relevant.',
    `Write a friendly recap of the last ${hours} hour(s) of chat. Mention major topics, notable questions, and action items if any.\n\nChat log:\n${messages.join('\n')}`,
    1200
  );
}
