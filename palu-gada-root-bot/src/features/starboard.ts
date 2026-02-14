import { rootServer, ChannelMessageReactionCreatedEvent, ChannelMessageEvent } from "@rootsdk/server-bot";
import db from "../database";

// Threshold for starboard
const STAR_THRESHOLD = 3;
const STAR_EMOJI = "⭐";

export function initStarboard() {
    rootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageReactionCreated, async (event: ChannelMessageReactionCreatedEvent) => {
        if (event.shortcode !== STAR_EMOJI) {
            // Check giveaway entry
            if (event.shortcode === "🎉") {
                db.prepare("INSERT OR IGNORE INTO giveaway_entries (giveaway_message_id, user_id) VALUES (?, ?)")
                    .run(event.messageId, event.userId);
            }
            return;
        }

        const messageId = event.messageId;
        const channelId = event.channelId;
        const guildId = event.communityId || "default";

        // Check if message is already in starboard table (simple counter)
        // We need to fetch current count. Since API doesn't push count, we have to track it ourselves 
        // or just increment blindly.
        // But we need to handle removals too.

        // Simplified logic: Check if message meets threshold in our DB tracking.
        // Real starboard usually needs `reactionAdd` and `reactionRemove` events.

        // Let's assume we just track additions for now as simpler MVP.
        const row = db.prepare("SELECT star_count FROM starboard WHERE message_id = ?").get(messageId) as any;
        let count = row ? row.star_count + 1 : 1;

        db.prepare("INSERT OR REPLACE INTO starboard (message_id, guild_id, channel_id, star_count) VALUES (?, ?, ?, ?)")
            .run(messageId, guildId, channelId, count);

        if (count === STAR_THRESHOLD) {
            // Fetch message content to repost
            // Error handling omitted
            const msg = await rootServer.community.channelMessages.get({ channelId, id: messageId });

            // Find starboard channel (hardcoded name 'starboard' or Config)
            // List channels and find one named 'starboard'
            // For now just repost to same channel as proof of concept if we can't find channel easily without keeping channel cache

            await rootServer.community.channelMessages.create({
                channelId: channelId, // Should be starboard channel ID
                content: `⭐ **${count}** <@${msg.userId}> in <#${channelId}>\n\n${msg.messageContent}`
            });
        }
    });

    // Handle reaction removals for giveaways
    // Note: ChannelMessageEvent.ChannelMessageReactionDeleted is needed
    // Assuming rootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageReactionDeleted, ...) works if available
}
