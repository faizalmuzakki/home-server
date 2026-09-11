import {
    getDueSuggestions,
    getSuggestion,
    getSuggestionTally,
    getSuggestionSettings,
    countActiveMembers,
    closeSuggestion,
} from '../database/models.js';
import { computeVerdict } from '../utils/suggestionVerdict.js';
import { buildSuggestionEmbed, buildSuggestionComponents, VOTE_STATUS_LABEL } from '../utils/suggestionEmbed.js';
import config from '../config.js';

/**
 * Closes one suggestion: works out the verdict, rewrites the message with the
 * Approve/Reject buttons, and pings whoever makes the call. Returns the
 * verdict so callers can report it.
 */
export async function closeSuggestionNow(client, suggestion) {
    const settings = getSuggestionSettings(suggestion.guild_id);
    const tally = getSuggestionTally(suggestion.id);
    const activeMembers = countActiveMembers(suggestion.guild_id, settings.activity_window_days);
    const verdict = computeVerdict({ up: tally.up, down: tally.down, activeMembers, settings });

    if (!closeSuggestion(suggestion.id, verdict)) {
        // Another pass closed it first.
        return verdict;
    }

    const closed = getSuggestion(suggestion.id);

    try {
        const channel = await client.channels.fetch(suggestion.channel_id);
        const message = await channel.messages.fetch(suggestion.message_id);
        const author = await client.users.fetch(suggestion.author_id).catch(() => null);

        await message.edit({
            embeds: [buildSuggestionEmbed(closed, tally, author)],
            components: buildSuggestionComponents(closed, tally),
        });

        const mention = settings.staff_role_id
            ? `<@&${settings.staff_role_id}>`
            : config.ownerId ? `<@${config.ownerId}>` : '';

        await message.reply({
            content: `${mention} Suggestion #${closed.id} is done voting — ${VOTE_STATUS_LABEL[verdict.status]} (👍 ${verdict.up} · 👎 ${verdict.down}, ${verdict.required} needed). Approve or reject it on the message above.`.trim(),
            allowedMentions: settings.staff_role_id
                ? { roles: [settings.staff_role_id] }
                : { users: config.ownerId ? [config.ownerId] : [] },
        });
    } catch (error) {
        console.error('[ERROR] Failed to announce suggestion result:', suggestion.id, error);
    }

    return verdict;
}

async function checkDueSuggestions(client) {
    for (const suggestion of getDueSuggestions()) {
        try {
            await closeSuggestionNow(client, suggestion);
        } catch (error) {
            console.error('[ERROR] Failed to close suggestion:', suggestion.id, error);
        }
    }
}

export function start(client) {
    setInterval(() => checkDueSuggestions(client), 30000);
    console.log('[INFO] Suggestion checker started');
}
