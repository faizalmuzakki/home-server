import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import Anthropic from '@anthropic-ai/sdk';
import { AI_MODEL, getAiFooter } from '../config/ai.js';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export default {
    data: new SlashCommandBuilder()
        .setName('answer')
        .setDescription('Reply to a question and let AI answer on your behalf based on conversation context')
        .addIntegerOption(option =>
            option
                .setName('hours')
                .setDescription('Hours of conversation to analyze (default: 2, max: 6)')
                .setMinValue(1)
                .setMaxValue(6)
        ),

    async execute(interaction) {
        // Check if API key is configured
        if (!process.env.ANTHROPIC_API_KEY) {
            return interaction.reply({
                content: 'Anthropic API key is not configured. Please set ANTHROPIC_API_KEY in the environment.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const hours = interaction.options.getInteger('hours') || 2;
        const targetUser = interaction.user; // Always answer as the person running the command
        let questionMessage = null;

        // Try to get the replied message
        let repliedMessage = null;
        try {
            // Fetch recent messages to find if there's a reply context
            const recentMessages = await interaction.channel.messages.fetch({ limit: 10 });
            for (const [, msg] of recentMessages) {
                if (msg.author.id === interaction.user.id && msg.reference) {
                    repliedMessage = await interaction.channel.messages.fetch(msg.reference.messageId);
                    break;
                }
            }
        } catch (e) {
            // No reply found
        }

        // If we have a replied message, use it as the question
        if (repliedMessage) {
            questionMessage = {
                content: repliedMessage.content,
                author: repliedMessage.author,
            };
        }

        // If no replied message, we'll auto-detect from conversation
        if (!questionMessage) {
            // That's fine, we'll detect the question from context
        }

        await interaction.deferReply();

        try {
            // Calculate the timestamp for X hours ago
            const hoursAgo = Date.now() - (hours * 60 * 60 * 1000);

            // Fetch messages from the channel
            const messages = [];
            let lastMessageId = null;
            let reachedTimeLimit = false;

            // Fetch messages in batches (Discord API limit is 100 per request)
            while (!reachedTimeLimit) {
                const options = { limit: 100 };
                if (lastMessageId) {
                    options.before = lastMessageId;
                }

                const fetchedMessages = await interaction.channel.messages.fetch(options);

                if (fetchedMessages.size === 0) break;

                for (const [id, msg] of fetchedMessages) {
                    if (msg.createdTimestamp < hoursAgo) {
                        reachedTimeLimit = true;
                        break;
                    }

                    // Include all non-bot messages
                    if (!msg.author.bot && msg.content.trim()) {
                        messages.push({
                            authorId: msg.author.id,
                            author: msg.author.displayName || msg.author.username,
                            content: msg.content,
                            timestamp: msg.createdAt.toISOString(),
                            mentions: msg.mentions.users.map(u => u.id),
                        });
                    }

                    lastMessageId = id;
                }

                // Safety limit - 300 messages should be enough context
                if (messages.length >= 300) break;
            }

            if (messages.length < 3) {
                return interaction.editReply({
                    content: `Not enough conversation context found in the last ${hours} hour(s). Need at least a few messages to analyze.`,
                });
            }

            // Reverse to chronological order
            messages.reverse();

            // Format messages for Claude
            const targetName = targetUser.displayName || targetUser.username;
            const chatLog = messages
                .map(m => {
                    const isTargetUser = m.authorId === targetUser.id;
                    const prefix = isTargetUser ? `[${m.author} (YOU - the person to answer as)]` : `[${m.author}]`;
                    return `${prefix}: ${m.content}`;
                })
                .join('\n');

            // Build the prompt
            let prompt;

            if (questionMessage) {
                // We have a specific question from the replied message
                const askerName = questionMessage.author.displayName || questionMessage.author.username;
                prompt = `You are helping ${targetName} answer a question in a Discord chat. You need to respond AS ${targetName}, based on their personality and communication style from the conversation.

The question being asked (by ${askerName}) is: "${questionMessage.content}"

Based on the conversation context below, generate a helpful and natural-sounding answer that ${targetName} would give. Consider:
- ${targetName}'s communication style, tone, and personality from the conversation
- Any relevant context, opinions, or information ${targetName} has shared
- How ${targetName} typically responds to similar questions
- Keep it authentic to how ${targetName} writes

Recent conversation (last ${hours} hour(s)):
---
${chatLog}
---

Generate a natural response as ${targetName} would write it. Keep it concise and conversational (1-3 sentences typically). Do NOT include any prefix like their name - just the answer itself. Match their typing style (casual, formal, uses emojis, etc.).`;
            } else {
                // No specific question, detect from conversation
                prompt = `You are helping ${targetName} respond in a Discord chat. You need to respond AS ${targetName}, based on their personality and communication style from the conversation.

Look at the conversation and identify the most recent thing ${targetName} should respond to - either a direct question to them, something they were mentioned in, or a topic they'd naturally want to chime in on.

Based on the conversation context below, generate a helpful and natural-sounding response that ${targetName} would give. Consider:
- ${targetName}'s communication style, tone, and personality from the conversation
- Any relevant context, opinions, or information ${targetName} has shared
- How ${targetName} typically responds
- Keep it authentic to how ${targetName} writes

Recent conversation (last ${hours} hour(s)):
---
${chatLog}
---

Respond in this format:
REPLYING TO: [What you're responding to - the question or topic]
RESPONSE: [A natural response as ${targetName} would write it]

Keep the response concise and conversational (1-3 sentences typically). Match their typing style.`;
            }

            // Call Claude API
            const response = await anthropic.messages.create({
                model: AI_MODEL,
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
            });

            const aiResponse = response.content[0].text;

            // Parse the response
            let questionText = questionMessage?.content || 'Auto-detected from conversation';
            let answerText = aiResponse;

            if (!questionMessage) {
                // Try to parse REPLYING TO: and RESPONSE: format
                const questionMatch = aiResponse.match(/REPLYING TO:\s*(.+?)(?=\nRESPONSE:|$)/s);
                const answerMatch = aiResponse.match(/RESPONSE:\s*(.+)/s);

                if (questionMatch) {
                    questionText = questionMatch[1].trim();
                }
                if (answerMatch) {
                    answerText = answerMatch[1].trim();
                }
            }

            // Truncate question text if too long
            const displayQuestion = questionText.length > 200
                ? questionText.substring(0, 197) + '...'
                : questionText;

            // Send the answer
            await interaction.editReply({
                embeds: [{
                    color: 0x5865F2,
                    author: {
                        name: `${targetName} might say...`,
                        icon_url: targetUser.displayAvatarURL({ dynamic: true }),
                    },
                    description: answerText,
                    fields: [
                        {
                            name: 'Responding to',
                            value: displayQuestion,
                            inline: false,
                        },
                        {
                            name: 'Context analyzed',
                            value: `${messages.length} messages from last ${hours}h`,
                            inline: true,
                        },
                    ],
                    footer: getAiFooter('AI-generated response based on your conversation style'),
                    timestamp: new Date().toISOString(),
                }],
            });
        } catch (error) {
            await logCommandError(interaction, error, 'answer');

            let errorMessage = 'Failed to generate answer.';
            if (error.status === 401) {
                errorMessage = 'Invalid Anthropic API key.';
            } else if (error.status === 429) {
                errorMessage = 'Rate limited. Please try again later.';
            } else if (error.message) {
                errorMessage = error.message;
            }

            await interaction.editReply({
                content: `Error: ${errorMessage}`,
            });
        }
    },
};
