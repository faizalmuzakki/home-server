import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ChannelType } from 'discord.js';
import { askClaude } from '../utils/claudeApi.js';
import { getAiFooter, DISCORD_FORMAT_PROMPT } from '../config/ai.js';
import { sendAiReply } from '../utils/aiReply.js';

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
            const digest = await askClaude(`You are writing a casual daily recap for a Discord server covering the last ${hours} hour(s). For each channel that had meaningful activity, write 1-3 sentences describing what was discussed. Be friendly and conversational. Skip channels with only trivial chatter. Format each channel as:

**#channel-name** — brief summary

Here is the server activity:
---
${chatLog}
---

Server recap:`, {
                systemPrompt: DISCORD_FORMAT_PROMPT,
            });

            await sendAiReply(interaction, {
                header: {
                    title: `📰 Server Recap — Last ${hours}h`,
                    fields: [{
                        name: 'Stats',
                        value: `${totalMessages} messages across ${channelDigests.length} channel(s)`,
                        inline: true,
                    }],
                    timestamp: new Date().toISOString(),
                },
                body: digest,
                footer: getAiFooter('', { smart: true }),
                mode: 'message',
            });
        } catch (error) {
            console.error('[ERROR] Recap failed:', error);
            let msg = 'Failed to generate recap.';
            if (error.status === 429) msg = 'Rate limited by AI provider. Try again in a moment.';
            else if (error.status === 401) msg = 'Invalid Anthropic API key.';
            await interaction.editReply({ content: `Error: ${msg}` });
        }
    },
};
