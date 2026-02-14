import { rootServer, JobInterval, JobScheduleEvent, JobData } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";
import { eightBallCommand } from "./8ball";
import { rollCommand } from "./roll";
import { jokeCommand } from "./joke";
import { memeCommand } from "./meme";

export { eightBallCommand, rollCommand, jokeCommand, memeCommand };

function parseTime(timeStr: string): number | null {
    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

export const birthdayCommand: Command = {
    name: "birthday",
    description: "Manage birthdays",
    usage: "/birthday <set/get> [day] [month]",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const subcommand = args[0]?.toLowerCase();
        const userId = event.userId;
        const guildId = event.communityId || "default";

        if (subcommand === "set") {
            const day = parseInt(args[1]);
            const month = parseInt(args[2]);

            if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: /birthday set <day> <month> (e.g. /birthday set 15 8)",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO birthdays (user_id, guild_id, day, month) VALUES (?, ?, ?, ?)")
                .run(userId, guildId, day, month);

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Birthday set to **${day}/${month}**!`,
            });
        } else if (subcommand === "get") {
            const targetId = args[1] || userId; // Extract UUID if mentioned? Simple fallback for now
            // TODO: Proper UUID extraction if needed

            const row = db.prepare("SELECT day, month FROM birthdays WHERE user_id = ? AND guild_id = ?").get(targetId, guildId) as any;

            if (row) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `<@${targetId}>'s birthday is on **${row.day}/${row.month}**! 🎂`,
                });
            } else {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `<@${targetId}> hasn't set their birthday yet.`,
                });
            }
        } else {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /birthday <set/get> [args]",
            });
        }
    }
};

export const confessionCommand: Command = {
    name: "confession",
    description: "Send an anonymous confession",
    usage: "/confession <message>",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const message = args.join(" ");

        if (!message) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /confession <message>",
            });
            return;
        }

        // Try to delete original message to keep anonymity
        try {
            await rootServer.community.channelMessages.delete({
                channelId: event.channelId,
                id: event.id
            });
        } catch (e) {
            // Ignore if can't delete
        }

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `🤐 **Confession:**\n\n"${message}"`,
        });
    }
};

export const giveawayCommand: Command = {
    name: "giveaway",
    description: "Start a giveaway",
    usage: "/giveaway <time> <prize>",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;

        if (args.length < 2) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /giveaway <time> <prize>",
            });
            return;
        }

        const timeStr = args[0];
        const prize = args.slice(1).join(" ");
        const duration = parseTime(timeStr);

        if (!duration) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Invalid time format.",
            });
            return;
        }

        const endTime = Date.now() + duration;

        // Create initial giveaway message
        const msg = await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `🎉 **GIVEAWAY** 🎉\n**Prize**: ${prize}\n**Ends**: in ${timeStr}\n\nReact with 🎉 to enter!`,
        });

        // Add initial reaction if possible
        try {
            await rootServer.community.channelMessages.reactionCreate({
                channelId: event.channelId,
                messageId: msg.id,
                shortcode: "🎉",
            });
        } catch (e) {
            // ignore
        }

        // Store giveaway in DB
        db.prepare("INSERT INTO giveaways (message_id, guild_id, channel_id, prize, end_time, winner_count) VALUES (?, ?, ?, ?, ?, ?)")
            .run(msg.id, event.communityId || "default", event.channelId, prize, endTime, 1);

        // Schedule job to end giveaway
        const payload = JSON.stringify({
            mid: msg.id,
            cid: event.channelId
        });

        await rootServer.jobScheduler.create({
            resourceId: event.userId,
            tag: `giveaway:${payload}`,
            start: new Date(endTime),
            jobInterval: JobInterval.OneTime
        });
    }
};

export async function handleGiveawayJob(job: JobData) {
    if (!job.tag?.startsWith("giveaway:")) return;

    try {
        const payloadJson = job.tag.substring("giveaway:".length);
        const payload = JSON.parse(payloadJson);
        const messageId = payload.mid;
        const channelId = payload.cid;

        const giveaway = db.prepare("SELECT * FROM giveaways WHERE message_id = ?").get(messageId) as any;
        if (!giveaway || giveaway.ended) return;

        // Fetch reacters (entries)
        // Since we don't have direct access to reactions list unless we tracked them via events, 
        // we should better rely on tracking reactions in 'giveaway_entries' table and fetch from there.
        // Assuming we have an event listener for reactions that populates this table.

        const entries = db.prepare("SELECT user_id FROM giveaway_entries WHERE giveaway_message_id = ?").all(messageId) as any[];

        if (entries.length === 0) {
            await rootServer.community.channelMessages.create({
                channelId: channelId,
                content: `❌ **Giveaway Ended**: No one entered for **${giveaway.prize}**.`,
            });
        } else {
            const winnerIndex = Math.floor(Math.random() * entries.length);
            const winnerId = entries[winnerIndex].user_id;

            await rootServer.community.channelMessages.create({
                channelId: channelId,
                content: `🎉 **Giveaway Ended**! The winner of **${giveaway.prize}** is <@${winnerId}>! 👏`,
            });

            db.prepare("UPDATE giveaways SET winners = ?, ended = 1 WHERE message_id = ?").run(winnerId, messageId);
        }

    } catch (e) {
        console.error("Error handling giveaway job:", e);
    }
}
