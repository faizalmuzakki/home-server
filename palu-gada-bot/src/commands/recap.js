import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import Anthropic from '@anthropic-ai/sdk';
import { AI_MODEL, getAiFooter } from '../config/ai.js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default {
    data: new SlashCommandBuilder()
        .setName('recap')
        .setDescription('Generate an AI digest of what happened in the server')
        .addIntegerOption(option =>
            option
                .setName('hours')
                .setDescription('How many hours to look back (default: 24, max: 72)')
                .setMinValue(1)
                .setMaxValue(72)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        if (!process.env.ANTHROPIC_API_KEY) {
            return interaction.reply({
                content: 'Anthropic API key is not configured.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const hours = interaction.options.getInteger('hours') ?? 24;
        await interaction.deferReply();

        const cutoff = Date.now() - hours * 60 * 60 * 1000;
        const guild = interaction.guild;

        // Gather all text channels the bot can read
        const textChannels = guild.channels.cache.filter(c =>
            c.type === ChannelType.GuildText &&
            c.permissionsFor(guild.members.me)?.has(['ViewChannel', 'ReadMessageHistory'])
        );

        const channelDigests = [];

        for (const [, channel] of textChannels) {
            const messages = [];
            let lastId = null;

            try {
                outer: while (true) {
                    const opts = { limit: 100 };
                    if (lastId) opts.before = lastId;

                    const fetched = await channel.messages.fetch(opts);
                    if (fetched.size === 0) break;

                    for (const [id, msg] of fetched) {
                        if (msg.createdTimestamp < cutoff) break outer;
                        if (!msg.author.bot && msg.content.trim()) {
                            messages.push(`[${msg.author.displayName || msg.author.username}]: ${msg.content}`);
                        }
                        lastId = id;
                        if (messages.length >= 200) break outer;
                    }
                }
            } catch {
                // No permission or other transient error — skip silently
            }

            if (messages.length > 0) {
                channelDigests.push({ name: channel.name, messages: messages.reverse() });
            }
        }

        if (channelDigests.length === 0) {
            return interaction.editReply({
                embeds: [{
                    color: 0xffff00,
                    title: '📰 No Activity Found',
                    description: `No messages found in the last ${hours} hour(s).`,
                }],
            });
        }

        const totalMessages = channelDigests.reduce((n, c) => n + c.messages.length, 0);

        const chatLog = channelDigests
            .map(c => `## #${c.name} (${c.messages.length} messages)\n${c.messages.join('\n')}`)
            .join('\n\n');

        try {
            const response = await anthropic.messages.create({
                model: AI_MODEL,
                max_tokens: 2048,
                messages: [{
                    role: 'user',
                    content: `You are writing a casual daily recap for a Discord server covering the last ${hours} hour(s). For each channel that had meaningful activity, write 1-3 sentences describing what was discussed. Be friendly and conversational. Skip channels with only trivial chatter. Format each channel as:

**#channel-name** — brief summary

Here is the server activity:
---
${chatLog}
---

Server recap:`,
                }],
            });

            const digest = response.content[0].text;

            // Split into multiple embeds if the digest exceeds Discord's 4096 char limit
            const MAX = 4000;
            const chunks = [];
            let remaining = digest;
            while (remaining.length > 0) {
                // Try to split at a newline near the limit
                const slice = remaining.slice(0, MAX);
                const splitAt = remaining.length > MAX ? slice.lastIndexOf('\n') : MAX;
                chunks.push(remaining.slice(0, splitAt > 0 ? splitAt : MAX));
                remaining = remaining.slice(splitAt > 0 ? splitAt : MAX).trimStart();
            }

            for (let i = 0; i < chunks.length; i++) {
                const embed = {
                    color: 0x5865F2,
                    description: chunks[i],
                    footer: getAiFooter(),
                };

                if (i === 0) {
                    embed.title = `📰 Server Recap — Last ${hours}h`;
                }
                if (i === chunks.length - 1) {
                    embed.fields = [{
                        name: 'Stats',
                        value: `${totalMessages} messages across ${channelDigests.length} channel(s)`,
                        inline: true,
                    }];
                    embed.timestamp = new Date().toISOString();
                }

                if (i === 0) {
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.followUp({ embeds: [embed] });
                }
            }
        } catch (error) {
            console.error('[ERROR] Recap failed:', error);
            let msg = 'Failed to generate recap.';
            if (error.status === 429) msg = 'Rate limited by AI provider. Try again in a moment.';
            else if (error.status === 401) msg = 'Invalid Anthropic API key.';
            await interaction.editReply({ content: `Error: ${msg}` });
        }
    },
};
