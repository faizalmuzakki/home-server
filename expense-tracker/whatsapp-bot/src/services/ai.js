import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful assistant in a WhatsApp group chat. Answer questions concisely and clearly.
Keep your responses short and to the point — ideally under 300 words since this is a chat message.
Use simple formatting (no markdown headers, just plain text with line breaks and emojis where appropriate).
If you don't know something, say so honestly.
Respond in the same language as the question.`;

export async function askQuestion(question) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: question,
    }],
  });

  const answer = response.content[0].text;

  return {
    answer,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}
