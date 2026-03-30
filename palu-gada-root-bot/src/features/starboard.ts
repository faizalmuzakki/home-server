import { rootServer, ChannelMessageReactionCreatedEvent, ChannelMessageEvent } from "@rootsdk/server-bot";
import db from "../database";

const STAR_THRESHOLD = parseInt(process.env.STARBOARD_THRESHOLD || "3", 10);
const STAR_EMOJI = "⭐";

export function initStarboard() {
    rootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageReactionCreated, async (event: ChannelMessageReactionCreatedEvent) => {
        // Handle giveaway entries on 🎉 reactions
        if (event.shortcode === "🎉") {
            db.prepare("INSERT OR IGNORE INTO giveaway_entries (giveaway_message_id, user_id) VALUES (?, ?)")
                .run(event.messageId, event.userId);
            return;
        }

        if (event.shortcode !== STAR_EMOJI) return;

        const messageId = event.messageId;
        const channelId = event.channelId;
        const guildId = event.communityId || "default";

        // Look up configured starboard channel
        const setting = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'starboard_channel_id'").get(guildId) as any;
        const starboardChannelId = setting?.value;
        if (!starboardChannelId) return; // Starboard not configured for this community

        // Prevent starring messages already in the starboard channel
        if (channelId === starboardChannelId) return;

        // Increment tracked count
        const row = db.prepare("SELECT star_count, posted, starboard_message_id FROM starboard WHERE message_id = ?").get(messageId) as any;
        const count = row ? row.star_count + 1 : 1;

        db.prepare("INSERT OR REPLACE INTO starboard (message_id, guild_id, channel_id, star_count, posted, starboard_message_id) VALUES (?, ?, ?, ?, ?, ?)")
            .run(messageId, guildId, channelId, count, row?.posted ?? 0, row?.starboard_message_id ?? null);

        if (row?.posted) {
            // Update the existing starboard post's star count
            if (row.starboard_message_id) {
                try {
                    const originalMsg = await rootServer.community.channelMessages.get({ channelId, id: messageId });
                    await rootServer.community.channelMessages.update({
                        channelId: starboardChannelId,
                        id: row.starboard_message_id,
                        content: `⭐ **${count}** | <@${originalMsg.userId}> in <#${channelId}>\n\n${originalMsg.messageContent}`,
                    });
                    db.prepare("UPDATE starboard SET star_count = ? WHERE message_id = ?").run(count, messageId);
                } catch {
                    // Starboard post may have been deleted — ignore
                }
            }
            return;
        }

        if (count < STAR_THRESHOLD) return;

        // First time reaching threshold — post to starboard
        try {
            const msg = await rootServer.community.channelMessages.get({ channelId, id: messageId });
            const created = await rootServer.community.channelMessages.create({
                channelId: starboardChannelId,
                content: `⭐ **${count}** | <@${msg.userId}> in <#${channelId}>\n\n${msg.messageContent}`,
            });
            db.prepare("UPDATE starboard SET posted = 1, starboard_message_id = ? WHERE message_id = ?")
                .run(created.id, messageId);
        } catch (error) {
            console.error("Failed to post starboard message:", error);
        }
    });
}
