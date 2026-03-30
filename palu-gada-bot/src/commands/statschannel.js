import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { setStatsChannel, removeStatsChannel, getStatsChannels } from '../database/models.js';

const STAT_TYPES = ['members', 'online', 'boosts'];

const STAT_LABELS = {
    members: '👥 Members',
    online:  '🟢 Online',
    boosts:  '🚀 Boosts',
};

export default {
    data: new SlashCommandBuilder()
        .setName('statschannel')
        .setDescription('Link a voice channel to a live server stat')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Link a voice channel to a stat counter')
                .addStringOption(opt =>
                    opt.setName('type')
                        .setDescription('Which stat to display')
                        .setRequired(true)
                        .addChoices(
                            { name: '👥 Total members', value: 'members' },
                            { name: '🟢 Online members', value: 'online' },
                            { name: '🚀 Server boosts',  value: 'boosts' },
                        )
                )
                .addChannelOption(opt =>
                    opt.setName('channel')
                        .setDescription('Voice channel to use for this stat')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Unlink a stat counter channel')
                .addStringOption(opt =>
                    opt.setName('type')
                        .setDescription('Stat to remove')
                        .setRequired(true)
                        .addChoices(
                            { name: '👥 Total members', value: 'members' },
                            { name: '🟢 Online members', value: 'online' },
                            { name: '🚀 Server boosts',  value: 'boosts' },
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all configured stat channels')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'set') {
            const type = interaction.options.getString('type');
            const channel = interaction.options.getChannel('channel');

            const me = interaction.guild.members.me;
            const perms = channel.permissionsFor(me);
            if (!perms?.has('ManageChannels')) {
                return interaction.reply({
                    content: `I need the **Manage Channels** permission in ${channel} to rename it.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            setStatsChannel(interaction.guildId, channel.id, type);

            // Do an immediate rename so the change is visible right away
            const guild = interaction.guild;
            const count = await getStatValue(guild, type);
            const newName = formatStatName(type, count);
            await channel.setName(newName).catch(() => {});

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '📊 Stats Channel Configured',
                    description: `${channel} will now display **${STAT_LABELS[type]}** and update every 10 minutes.`,
                    fields: [{ name: 'Current value', value: `${newName}`, inline: true }],
                }],
            });

        } else if (sub === 'remove') {
            const type = interaction.options.getString('type');
            const result = removeStatsChannel(interaction.guildId, type);

            if (result.changes === 0) {
                return interaction.reply({
                    content: `No stats channel is configured for **${STAT_LABELS[type]}**.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                embeds: [{
                    color: 0xED4245,
                    title: '📊 Stats Channel Removed',
                    description: `The **${STAT_LABELS[type]}** channel will no longer be updated.`,
                    footer: { text: 'You can manually rename or delete the voice channel.' },
                }],
            });

        } else if (sub === 'list') {
            const channels = getStatsChannels(interaction.guildId);

            if (channels.length === 0) {
                return interaction.reply({
                    content: 'No stats channels configured. Use `/statschannel set` to set one up.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const lines = channels.map(c =>
                `${STAT_LABELS[c.stat_type] || c.stat_type} → <#${c.channel_id}>`
            ).join('\n');

            await interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '📊 Stats Channels',
                    description: lines,
                    footer: { text: 'Channels update every 10 minutes.' },
                }],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};

/**
 * Compute the current value for a given stat type.
 * @param {import('discord.js').Guild} guild
 * @param {'members'|'online'|'boosts'} type
 */
export async function getStatValue(guild, type) {
    switch (type) {
        case 'members':
            return guild.memberCount;
        case 'online': {
            // Fetch all members to get accurate presence data
            await guild.members.fetch({ withPresences: true }).catch(() => {});
            return guild.members.cache.filter(
                m => !m.user.bot && m.presence && m.presence.status !== 'offline'
            ).size;
        }
        case 'boosts':
            return guild.premiumSubscriptionCount || 0;
        default:
            return 0;
    }
}

export function formatStatName(type, count) {
    switch (type) {
        case 'members': return `👥 Members: ${count}`;
        case 'online':  return `🟢 Online: ${count}`;
        case 'boosts':  return `🚀 Boosts: ${count}`;
        default:        return `${type}: ${count}`;
    }
}
