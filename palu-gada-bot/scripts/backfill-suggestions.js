/**
 * Moves suggestions posted before /suggest used #suggestions into that
 * channel: reposts each one with its current tally and buttons, points the
 * DB row at the new message, and turns the old message into a link.
 *
 * Dry run by default. Run inside the container:
 *   docker exec palu-gada-bot node scripts/backfill-suggestions.js [--apply]
 */
import { Client, GatewayIntentBits, Events } from 'discord.js';
import config from '../src/config.js';
import db from '../src/database/db.js';
import { getSuggestionTally } from '../src/database/models.js';
import { buildSuggestionEmbed, buildSuggestionComponents } from '../src/utils/suggestionEmbed.js';
import { findSuggestionChannel } from '../src/commands/suggest.js';

const apply = process.argv.includes('--apply');
const moveStmt = db.prepare('UPDATE suggestions SET channel_id = ?, message_id = ? WHERE id = ?');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async () => {
    const suggestions = db.prepare('SELECT * FROM suggestions ORDER BY id').all();
    let moved = 0;

    for (const suggestion of suggestions) {
        const target = findSuggestionChannel(client.guilds.cache.get(suggestion.guild_id));
        if (!target || target.id === suggestion.channel_id) continue;

        console.log(`#${suggestion.id} (${suggestion.status}) ${suggestion.channel_id} -> #${target.name} ${target.id}`);
        moved++;
        if (!apply) continue;

        const tally = getSuggestionTally(suggestion.id);
        const author = await client.users.fetch(suggestion.author_id).catch(() => null);
        const message = await target.send({
            embeds: [buildSuggestionEmbed(suggestion, tally, author)],
            components: buildSuggestionComponents(suggestion, tally),
        });
        moveStmt.run(target.id, message.id, suggestion.id);

        // Old message may be gone already; the repost is what matters.
        try {
            const oldChannel = await client.channels.fetch(suggestion.channel_id);
            const old = await oldChannel.messages.fetch(suggestion.message_id);
            await old.edit({ content: `Suggestion #${suggestion.id} moved to ${target}: ${message.url}`, embeds: [], components: [] });
        } catch (error) {
            console.warn(`  old message not updated: ${error.message}`);
        }
    }

    console.log(apply ? `Moved ${moved}.` : `${moved} to move. Re-run with --apply.`);
    client.destroy();
});

client.login(config.token);
