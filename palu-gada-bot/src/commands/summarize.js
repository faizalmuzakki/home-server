import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export default {
    data: new SlashCommandBuilder()
        .setName('summarize')
        .setDescription('Summarize the last hour of chat history in this channel')
        .addIntegerOption(option =>
            option
                .setName('hours')
                .setDescription('Number of hours to look back (default: 1, max: 24)')
                .setMinValue(1)
                .setMaxValue(24)
        )
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to summarize (default: current channel)')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        // Check if API key is configured
        if (!process.env.ANTHROPIC_API_KEY) {
            return interaction.reply({
                content: 'Anthropic API key is not configured. Please set ANTHROPIC_API_KEY in the environment.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const hours = interaction.options.getInteger('hours') || 1;
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        // Check if the channel is a text channel
        if (!targetChannel.isTextBased()) {
            return interaction.reply({
                content: 'I can only summarize text channels!',
                flags: MessageFlags.Ephemeral,
            });
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

                const fetchedMessages = await targetChannel.messages.fetch(options);

                if (fetchedMessages.size === 0) break;

                for (const [id, msg] of fetchedMessages) {
                    if (msg.createdTimestamp < hoursAgo) {
                        reachedTimeLimit = true;
                        break;
                    }

                    // Skip bot messages and empty messages
                    if (!msg.author.bot && msg.content.trim()) {
                        messages.push({
                            author: msg.author.displayName || msg.author.username,
                            content: msg.content,
                            timestamp: msg.createdAt.toISOString(),
                        });
                    }

                    lastMessageId = id;
                }

                // Safety limit to prevent infinite loops
                if (messages.length >= 500) break;
            }

            if (messages.length === 0) {
                return interaction.editReply({
                    embeds: [{
                        color: 0xffff00,
                        title: '📝 No Messages Found',
                        description: `No messages found in the last ${hours} hour(s) in ${targetChannel}.`,
                    }],
                });
            }

            // Reverse to chronological order
            messages.reverse();

            // Format messages for Claude
            const chatLog = messages
                .map(m => `[${m.author}]: ${m.content}`)
                .join('\n');

            // Call Claude API
            const response = await anthropic.messages.create({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: `Please summarize the following Discord chat conversation. Focus on:
- Main topics discussed
- Key decisions or conclusions reached
- Important questions asked
- Any action items or next steps mentioned

Keep the summary concise but informative. Use bullet points for clarity.

Chat log from the last ${hours} hour(s):
---
${chatLog}
---

Summary:`,
                    },
                ],
            });

            const summary = response.content[0].text;

            // Send the summary
            await interaction.editReply({
                embeds: [{
                    color: 0x7289da,
                    title: `📝 Chat Summary`,
                    description: summary,
                    fields: [
                        {
                            name: 'Channel',
                            value: `${targetChannel}`,
                            inline: true,
                        },
                        {
                            name: 'Time Range',
                            value: `Last ${hours} hour(s)`,
                            inline: true,
                        },
                        {
                            name: 'Messages Analyzed',
                            value: `${messages.length}`,
                            inline: true,
                        },
                    ],
                    footer: {
                        text: 'Powered by Claude 3.5 Haiku',
                    },
                    timestamp: new Date().toISOString(),
                }],
            });
        } catch (error) {
            await logCommandError(interaction, error, 'summarize');

            let errorMessage = 'Failed to generate summary.';
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
