import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import {
    getSuggestionSettings,
    updateSuggestionSettings,
    getOpenSuggestions,
    getGuildSuggestionsByStatus,
    getSuggestion,
    getSuggestionTally,
    countActiveMembers,
} from '../database/models.js';
import { computeRequiredVotes } from '../utils/suggestionVerdict.js';
import { closeSuggestionNow } from '../services/suggestionScheduler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('suggestions')
        .setDescription('Manage the suggestion vote')
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Show or change how suggestions are judged')
                .addIntegerOption(option =>
                    option.setName('duration_hours').setDescription('Default voting window in hours').setMinValue(1).setMaxValue(336)
                )
                .addIntegerOption(option =>
                    option.setName('activity_window_days').setDescription('How far back a member counts as active').setMinValue(1).setMaxValue(90)
                )
                .addIntegerOption(option =>
                    option.setName('participation_pct').setDescription('Share of active members that must vote').setMinValue(1).setMaxValue(100)
                )
                .addIntegerOption(option =>
                    option.setName('min_votes').setDescription('Never require fewer votes than this').setMinValue(1).setMaxValue(100)
                )
                .addIntegerOption(option =>
                    option.setName('max_votes').setDescription('Never require more votes than this').setMinValue(1).setMaxValue(500)
                )
                .addIntegerOption(option =>
                    option.setName('pass_ratio_pct').setDescription('Upvote share needed to pass').setMinValue(50).setMaxValue(100)
                )
                .addIntegerOption(option =>
                    option.setName('reject_ratio_pct').setDescription('Upvote share at or below which it is rejected').setMinValue(0).setMaxValue(50)
                )
                .addRoleOption(option =>
                    option.setName('staff_role').setDescription('Role pinged when a vote closes (defaults to the bot owner)')
                )
                .addBooleanOption(option =>
                    option.setName('ping_owner_instead').setDescription('Stop pinging a role and go back to pinging the bot owner')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List suggestions')
                .addStringOption(option =>
                    option
                        .setName('state')
                        .setDescription('Which suggestions to list')
                        .addChoices(
                            { name: 'Open', value: 'open' },
                            { name: 'Awaiting your decision', value: 'closed' },
                            { name: 'Approved', value: 'approved' },
                            { name: 'Declined', value: 'declined' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('Close a suggestion vote right now')
                .addIntegerOption(option =>
                    option.setName('id').setDescription('Suggestion number').setRequired(true).setMinValue(1)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({
                content: 'Suggestions only work inside a server.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'config') return showOrUpdateConfig(interaction);
        if (subcommand === 'list') return listSuggestions(interaction);
        if (subcommand === 'end') return endSuggestion(interaction);
    },
};

async function showOrUpdateConfig(interaction) {
    const staffRole = interaction.options.getRole('staff_role');
    const pingOwnerInstead = interaction.options.getBoolean('ping_owner_instead');
    const updates = {
        duration_hours: interaction.options.getInteger('duration_hours'),
        activity_window_days: interaction.options.getInteger('activity_window_days'),
        participation_pct: interaction.options.getInteger('participation_pct'),
        min_votes: interaction.options.getInteger('min_votes'),
        max_votes: interaction.options.getInteger('max_votes'),
        pass_ratio_pct: interaction.options.getInteger('pass_ratio_pct'),
        reject_ratio_pct: interaction.options.getInteger('reject_ratio_pct'),
        staff_role_id: pingOwnerInstead ? '' : staffRole?.id ?? null,
    };

    const current = getSuggestionSettings(interaction.guildId);
    const wanted = { ...current };
    let changed = false;

    for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === undefined) continue;
        wanted[key] = value;
        changed = true;
    }

    // Validate the settings the guild would end up with, before writing them.
    if (wanted.min_votes > wanted.max_votes) {
        return interaction.reply({
            content: `Minimum votes (${wanted.min_votes}) is above the maximum (${wanted.max_votes}). Fix one of them or the quorum would always sit at the maximum.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    if (wanted.reject_ratio_pct >= wanted.pass_ratio_pct) {
        return interaction.reply({
            content: `The reject share (${wanted.reject_ratio_pct}%) must stay below the pass share (${wanted.pass_ratio_pct}%).`,
            flags: MessageFlags.Ephemeral,
        });
    }

    const settings = changed ? updateSuggestionSettings(interaction.guildId, updates) : current;
    const active = countActiveMembers(interaction.guildId, settings.activity_window_days);
    const required = computeRequiredVotes(active, settings);

    return interaction.reply({
        embeds: [{
            color: 0x5865F2,
            title: changed ? 'Suggestion settings updated' : 'Suggestion settings',
            fields: [
                { name: 'Voting window', value: `${settings.duration_hours}h`, inline: true },
                { name: 'Activity window', value: `${settings.activity_window_days} days`, inline: true },
                { name: 'Participation', value: `${settings.participation_pct}% of active members`, inline: true },
                { name: 'Vote floor / ceiling', value: `${settings.min_votes} / ${settings.max_votes}`, inline: true },
                { name: 'Pass / reject share', value: `${settings.pass_ratio_pct}% / ${settings.reject_ratio_pct}%`, inline: true },
                { name: 'Notified on close', value: settings.staff_role_id ? `<@&${settings.staff_role_id}>` : 'the bot owner', inline: true },
                { name: 'Right now', value: `${active} active member${active === 1 ? '' : 's'} → **${required} votes** needed for a verdict`, inline: false },
            ],
            timestamp: new Date().toISOString(),
        }],
        flags: MessageFlags.Ephemeral,
    });
}

async function listSuggestions(interaction) {
    const state = interaction.options.getString('state') || 'open';
    const rows = state === 'open'
        ? getOpenSuggestions(interaction.guildId)
        : getGuildSuggestionsByStatus(interaction.guildId, state, 15);

    if (rows.length === 0) {
        return interaction.reply({
            content: `No ${state} suggestions.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    const lines = rows.slice(0, 15).map(row => {
        const tally = getSuggestionTally(row.id);
        const link = row.message_id
            ? `https://discord.com/channels/${row.guild_id}/${row.channel_id}/${row.message_id}`
            : null;
        const title = row.content.length > 80 ? `${row.content.slice(0, 77)}...` : row.content;
        return `**#${row.id}** ${link ? `[${title}](${link})` : title}\n👍 ${tally.up} · 👎 ${tally.down} · by <@${row.author_id}>`;
    });

    return interaction.reply({
        embeds: [{
            color: 0x5865F2,
            title: `Suggestions — ${state}`,
            description: lines.join('\n\n'),
            timestamp: new Date().toISOString(),
        }],
        flags: MessageFlags.Ephemeral,
    });
}

async function endSuggestion(interaction) {
    const id = interaction.options.getInteger('id');
    const suggestion = getSuggestion(id);

    if (!suggestion || suggestion.guild_id !== interaction.guildId) {
        return interaction.reply({
            content: `No suggestion #${id} in this server.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    if (suggestion.status !== 'open') {
        return interaction.reply({
            content: `Suggestion #${id} is already closed.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const verdict = await closeSuggestionNow(interaction.client, suggestion);

    return interaction.editReply({
        content: `Suggestion #${id} closed: **${verdict.status.replace('_', ' ')}** on ${verdict.up}/${verdict.down} votes (${verdict.required} needed).`,
    });
}
