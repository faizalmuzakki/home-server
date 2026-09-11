import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { parseDbDate } from './dbDate.js';

/**
 * Rendering for suggestion messages, shared by the command, the button
 * handler and the scheduler so a suggestion looks the same wherever it is
 * rewritten.
 */

const VOTE_STATUS_LABEL = {
    passed: '✅ Passed the vote',
    rejected: '❌ Rejected by the vote',
    undecided: '🤔 Split vote',
    no_quorum: '💤 Not enough votes',
};

const STATUS_COLOR = {
    open: 0x5865F2,
    closed: 0xFEE75C,
    approved: 0x57F287,
    declined: 0xED4245,
    withdrawn: 0x747F8D,
};

function discordTimestamp(value, style = 'R') {
    return `<t:${Math.floor(parseDbDate(value).getTime() / 1000)}:${style}>`;
}

function ratioLine(up, down) {
    const total = up + down;
    const pct = total > 0 ? Math.round((up / total) * 100) : 0;
    const filled = Math.round(pct / 10);
    return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${pct}% in favour`;
}

/**
 * @param suggestion row from the suggestions table
 * @param tally { up, down } live counts
 * @param author the suggester's user object (may be null if they left)
 */
export function buildSuggestionEmbed(suggestion, tally, author) {
    const { up, down } = tally;
    const fields = [];

    if (suggestion.status === 'open') {
        fields.push({
            name: 'Voting ends',
            value: discordTimestamp(suggestion.ends_at),
            inline: true,
        });
        fields.push({
            name: 'Votes so far',
            value: `👍 ${up} · 👎 ${down}`,
            inline: true,
        });
    } else if (suggestion.status === 'withdrawn') {
        fields.push({
            name: 'Withdrawn',
            value: 'The author pulled this suggestion before the vote closed.',
            inline: false,
        });
    } else {
        fields.push({
            name: 'Result',
            value: `${VOTE_STATUS_LABEL[suggestion.vote_status] || 'Closed'}\n${ratioLine(up, down)}`,
            inline: false,
        });
        fields.push({
            name: 'Final tally',
            value: `👍 ${up} · 👎 ${down} (${up + down} of ${suggestion.required_votes} needed)`,
            inline: true,
        });
        fields.push({
            name: 'Quorum base',
            value: `${suggestion.active_members} active member${suggestion.active_members === 1 ? '' : 's'}`,
            inline: true,
        });
    }

    if (suggestion.status === 'approved' || suggestion.status === 'declined') {
        fields.push({
            name: 'Decision',
            value: suggestion.status === 'approved'
                ? `✅ Approved by <@${suggestion.decided_by}>`
                : `🚫 Declined by <@${suggestion.decided_by}>`,
            inline: false,
        });
    }

    return {
        color: STATUS_COLOR[suggestion.status] || STATUS_COLOR.open,
        author: author
            ? {
                name: `Suggestion from ${author.tag ?? author.username}`,
                icon_url: author.displayAvatarURL ? author.displayAvatarURL({ dynamic: true }) : undefined,
            }
            : { name: 'Suggestion' },
        title: `Suggestion #${suggestion.id}`,
        description: suggestion.content,
        fields,
        footer: {
            text: suggestion.status === 'open'
                ? 'One vote per person — vote again to take it back'
                : 'Voting closed',
        },
        timestamp: new Date().toISOString(),
    };
}

export function buildSuggestionComponents(suggestion, tally) {
    const { up, down } = tally;

    if (suggestion.status === 'open') {
        return [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`suggest:vote:up:${suggestion.id}`)
                    .setLabel(`👍 ${up}`)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`suggest:vote:down:${suggestion.id}`)
                    .setLabel(`👎 ${down}`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`suggest:withdraw:${suggestion.id}`)
                    .setLabel('Withdraw')
                    .setStyle(ButtonStyle.Secondary)
            ),
        ];
    }

    const lockedTally = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`suggest:locked:up:${suggestion.id}`)
            .setLabel(`👍 ${up}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`suggest:locked:down:${suggestion.id}`)
            .setLabel(`👎 ${down}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
    );

    if (suggestion.status !== 'closed') {
        return [lockedTally];
    }

    return [
        lockedTally,
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`suggest:decide:approve:${suggestion.id}`)
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`suggest:decide:reject:${suggestion.id}`)
                .setLabel('Reject')
                .setStyle(ButtonStyle.Danger)
        ),
    ];
}

export { VOTE_STATUS_LABEL };
