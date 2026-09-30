import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import {
    createSuggestion,
    setSuggestionMessage,
    getSuggestion,
    getSuggestionSettings,
    getSuggestionTally,
    castSuggestionVote,
    withdrawSuggestion,
    decideSuggestion,
} from '../database/models.js';
import { buildSuggestionEmbed, buildSuggestionComponents } from '../utils/suggestionEmbed.js';
import { parseDbDate, toDbDate } from '../utils/dbDate.js';
import { parseDuration } from '../utils/duration.js';
import config from '../config.js';

function canDecide(interaction) {
    return interaction.user.id === config.ownerId
        || interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

/**
 * The server's #suggestions channel, when there is one the bot can post in,
 * so votes live in one place. Also used by scripts/backfill-suggestions.js.
 */
export function findSuggestionChannel(guild) {
    // ponytail: matched by name, add a suggestion_settings column if a server wants another channel
    const channel = guild?.channels.cache.find(c => c.name === 'suggestions' && c.isTextBased());
    const canPost = channel?.permissionsFor(guild.members.me)?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
    ]);
    return canPost ? channel : null;
}

async function dmSuggester(client, suggestion, approved) {
    const link = `https://discord.com/channels/${suggestion.guild_id}/${suggestion.channel_id}/${suggestion.message_id}`;

    try {
        const author = await client.users.fetch(suggestion.author_id);
        await author.send({
            embeds: [{
                color: approved ? 0x57F287 : 0xED4245,
                title: approved ? '✅ Your suggestion was approved' : '🚫 Your suggestion was declined',
                description: suggestion.content,
                fields: [{ name: 'Suggestion', value: `[#${suggestion.id}](${link})` }],
                timestamp: new Date().toISOString(),
            }],
        });
        return true;
    } catch {
        // DMs closed, or the user left the server
        return false;
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Put a suggestion to the server for a vote')
        .addStringOption(option =>
            option
                .setName('suggestion')
                .setDescription('What do you want to suggest?')
                .setRequired(true)
                .setMaxLength(1000)
        )
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('How long voting stays open (e.g. 12h, 2d, 1w). Defaults to the server setting.')
                .setRequired(false)
        ),

    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({
                content: 'Suggestions only work inside a server.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const content = interaction.options.getString('suggestion');
        const durationInput = interaction.options.getString('duration');
        const settings = getSuggestionSettings(interaction.guildId);

        let durationMs = settings.duration_hours * 3_600_000;
        if (durationInput) {
            const parsed = parseDuration(durationInput);
            if (!parsed) {
                return interaction.reply({
                    content: 'Invalid duration. Use something like `30m`, `12h`, `3d` or `1w`, up to 2 weeks.',
                    flags: MessageFlags.Ephemeral,
                });
            }
            durationMs = parsed;
        }

        // No #suggestions, or already in it: post where /suggest was run.
        const found = findSuggestionChannel(interaction.guild);
        const target = found && found.id !== interaction.channelId ? found : null;
        const endsAt = toDbDate(new Date(Date.now() + durationMs));
        const suggestion = createSuggestion(
            interaction.guildId,
            target?.id ?? interaction.channelId,
            interaction.user.id,
            content,
            endsAt
        );

        const tally = { up: 0, down: 0 };
        const post = {
            embeds: [buildSuggestionEmbed(suggestion, tally, interaction.user)],
            components: buildSuggestionComponents(suggestion, tally),
        };

        if (!target) {
            const message = await interaction.reply({ ...post, fetchReply: true });
            setSuggestionMessage(suggestion.id, message.id);
            return;
        }

        const message = await target.send(post);
        setSuggestionMessage(suggestion.id, message.id);

        return interaction.reply({
            content: `Suggestion #${suggestion.id} posted in ${target}: ${message.url}`,
            flags: MessageFlags.Ephemeral,
        });
    },

    async handleButton(interaction) {
        const [, action, ...rest] = interaction.customId.split(':');
        const suggestionId = parseInt(rest[rest.length - 1], 10);
        const suggestion = getSuggestion(suggestionId);

        if (!suggestion) {
            return interaction.reply({
                content: 'That suggestion is no longer on file.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (action === 'vote') {
            return handleVote(interaction, suggestion, rest[0] === 'up' ? 1 : -1);
        }

        if (action === 'withdraw') {
            return handleWithdraw(interaction, suggestion);
        }

        if (action === 'decide') {
            return handleDecision(interaction, suggestion, rest[0] === 'approve');
        }
    },
};

async function handleVote(interaction, suggestion, vote) {
    if (suggestion.status !== 'open' || parseDbDate(suggestion.ends_at) <= new Date()) {
        return interaction.reply({
            content: 'Voting on that suggestion has closed.',
            flags: MessageFlags.Ephemeral,
        });
    }

    const held = castSuggestionVote(suggestion.id, interaction.user.id, vote);
    const tally = getSuggestionTally(suggestion.id);

    await interaction.update({
        embeds: [buildSuggestionEmbed(suggestion, tally, await interaction.client.users.fetch(suggestion.author_id).catch(() => null))],
        components: buildSuggestionComponents(suggestion, tally),
    });

    const note = held === 0
        ? 'Vote taken back.'
        : held === 1 ? 'Voted 👍.' : 'Voted 👎.';

    return interaction.followUp({ content: note, flags: MessageFlags.Ephemeral });
}

async function handleWithdraw(interaction, suggestion) {
    const isAuthor = interaction.user.id === suggestion.author_id;

    if (!isAuthor && !canDecide(interaction)) {
        return interaction.reply({
            content: 'Only the author or a server manager can withdraw a suggestion.',
            flags: MessageFlags.Ephemeral,
        });
    }

    if (!withdrawSuggestion(suggestion.id)) {
        return interaction.reply({
            content: 'That suggestion is already closed.',
            flags: MessageFlags.Ephemeral,
        });
    }

    const updated = getSuggestion(suggestion.id);
    const tally = getSuggestionTally(suggestion.id);

    return interaction.update({
        embeds: [buildSuggestionEmbed(updated, tally, await interaction.client.users.fetch(suggestion.author_id).catch(() => null))],
        components: buildSuggestionComponents(updated, tally),
    });
}

async function handleDecision(interaction, suggestion, approved) {
    if (!canDecide(interaction)) {
        return interaction.reply({
            content: 'Only the bot owner or a server manager can decide a suggestion.',
            flags: MessageFlags.Ephemeral,
        });
    }

    if (!decideSuggestion(suggestion.id, approved ? 'approved' : 'declined', interaction.user.id)) {
        return interaction.reply({
            content: 'That suggestion has already been decided.',
            flags: MessageFlags.Ephemeral,
        });
    }

    const updated = getSuggestion(suggestion.id);
    const tally = getSuggestionTally(suggestion.id);

    await interaction.update({
        embeds: [buildSuggestionEmbed(updated, tally, await interaction.client.users.fetch(suggestion.author_id).catch(() => null))],
        components: buildSuggestionComponents(updated, tally),
    });

    const delivered = await dmSuggester(interaction.client, updated, approved);

    return interaction.followUp({
        content: delivered
            ? `Suggestion #${updated.id} ${approved ? 'approved' : 'declined'}, and <@${updated.author_id}> has been DMed.`
            : `Suggestion #${updated.id} ${approved ? 'approved' : 'declined'}. Could not DM <@${updated.author_id}> — their DMs are closed.`,
        flags: MessageFlags.Ephemeral,
    });
}
