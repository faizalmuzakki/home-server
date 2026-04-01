import { rootServer, JobInterval, JobScheduleEvent, JobData, ChannelGuid } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import db from "../../database";
import { eightBallCommand } from "./8ball";
import { rollCommand } from "./roll";
import { jokeCommand } from "./joke";
import { memeCommand } from "./meme";

export { eightBallCommand, rollCommand, jokeCommand, memeCommand };
export { starboardCommand } from "./starboard";
export { pollCommand } from "./poll";

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

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

function normalizeUserId(raw: string | undefined, fallback: string): string {
    if (!raw) return fallback;
    const match = raw.match(/^<@([A-Za-z0-9_-]+)>$/);
    return match?.[1] ?? raw;
}

function formatTimeLeft(ms: number): string {
    if (ms <= 0) return "Ended";

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

async function pickGiveawayWinners(channelId: string, messageId: string, announce: boolean): Promise<string | null> {
    const giveaway = db.prepare("SELECT * FROM giveaways WHERE message_id = ?").get(messageId) as any;
    if (!giveaway) return "Giveaway not found.";

    if (!giveaway.ended) {
        db.prepare("UPDATE giveaways SET ended = 1 WHERE message_id = ?").run(messageId);
    }

    const entries = db.prepare("SELECT user_id FROM giveaway_entries WHERE giveaway_message_id = ?").all(messageId) as Array<{ user_id: string }>;

    if (entries.length === 0) {
        if (announce) {
            await rootServer.community.channelMessages.create({
                channelId: channelId as unknown as ChannelGuid,
                content: `❌ **Giveaway Ended**: No one entered for **${giveaway.prize}**.`,
            });
        }
        return null;
    }

    const uniqueEntries = [...new Set(entries.map(entry => entry.user_id))];
    const shuffled = [...uniqueEntries];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const winnerCount = Math.max(1, Math.min(giveaway.winner_count || 1, shuffled.length));
    const winners = shuffled.slice(0, winnerCount);
    db.prepare("UPDATE giveaways SET winners = ?, ended = 1 WHERE message_id = ?")
        .run(winners.join(","), messageId);

    if (announce) {
        await rootServer.community.channelMessages.create({
            channelId: channelId as unknown as ChannelGuid,
            content: `🎉 **Giveaway Ended**! Winner${winners.length !== 1 ? "s" : ""} of **${giveaway.prize}**: ${winners.map(id => `<@${id}>`).join(", ")}`,
        });
    }

    return null;
}

export const birthdayCommand: Command = {
    name: "birthday",
    description: "Manage birthdays",
    usage: "/birthday <set/view/get/remove/upcoming/today/setup> [args]",
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
                    content: "Usage: `/birthday set <day> <month>` (e.g. `/birthday set 15 8`)",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO birthdays (user_id, guild_id, day, month) VALUES (?, ?, ?, ?)")
                .run(userId, guildId, day, month);

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Birthday set to **${day}/${month}**! 🎂`,
            });
        } else if (subcommand === "get" || subcommand === "view") {
            const targetId = normalizeUserId(args[1], userId);

            const row = db.prepare("SELECT day, month FROM birthdays WHERE user_id = ? AND guild_id = ?")
                .get(targetId, guildId) as any;

            if (row) {
                const today = new Date();
                let nextBirthday = new Date(today.getFullYear(), row.month - 1, row.day);
                if (nextBirthday < today) {
                    nextBirthday = new Date(today.getFullYear() + 1, row.month - 1, row.day);
                }
                const daysUntil = Math.ceil((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `🎂 <@${targetId}>'s birthday is on **${MONTH_NAMES[row.month - 1]} ${row.day}**.${daysUntil === 0 ? " It's today!" : ` (${daysUntil} day${daysUntil !== 1 ? "s" : ""} away)`}`,
                });
            } else {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `<@${targetId}> hasn't set their birthday yet.`,
                });
            }
        } else if (subcommand === "remove") {
            const result = db.prepare("DELETE FROM birthdays WHERE user_id = ? AND guild_id = ?").run(userId, guildId);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: result.changes > 0 ? "✅ Your birthday has been removed." : "You do not have a birthday set.",
            });
        } else if (subcommand === "upcoming") {
            const rows = db.prepare(`
                SELECT user_id, day, month
                FROM birthdays
                WHERE guild_id = ?
                ORDER BY CASE
                    WHEN month > ? OR (month = ? AND day >= ?) THEN (month - ?) * 31 + (day - ?)
                    ELSE (12 - ? + month) * 31 + (day - ?) + 365
                END ASC
                LIMIT 10
            `).all(
                guildId,
                new Date().getMonth() + 1,
                new Date().getMonth() + 1,
                new Date().getDate(),
                new Date().getMonth() + 1,
                new Date().getDate(),
                new Date().getMonth() + 1,
                new Date().getDate()
            ) as Array<{ user_id: string; day: number; month: number }>;

            if (rows.length === 0) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "No upcoming birthdays found.",
                });
                return;
            }

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `📅 **Upcoming Birthdays**\n${rows.map(row => `🎂 <@${row.user_id}> - ${MONTH_NAMES[row.month - 1]} ${row.day}`).join("\n")}`,
            });
        } else if (subcommand === "today") {
            const now = new Date();
            const rows = db.prepare("SELECT user_id FROM birthdays WHERE guild_id = ? AND day = ? AND month = ?")
                .all(guildId, now.getDate(), now.getMonth() + 1) as Array<{ user_id: string }>;

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: rows.length > 0
                    ? `🎉 **Today's Birthdays**\n${rows.map(row => `🎂 <@${row.user_id}>`).join("\n")}`
                    : "No birthdays today!",
            });
        } else if (subcommand === "setup") {
            // /birthday setup <channel_id>
            const channelId = args[1];
            if (!channelId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/birthday setup <channel_id>` — sets the channel for daily birthday announcements.",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "birthday_channel_id", channelId);

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Birthday announcements will be posted to <${channelId}>.`,
            });
        } else {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/birthday set <day> <month>` · `/birthday view [@user]` · `/birthday remove` · `/birthday upcoming` · `/birthday today` · `/birthday setup <channel_id>`",
            });
        }
    }
};

export const confessionCommand: Command = {
    name: "confession",
    description: "Send an anonymous confession (or set up the confessions channel)",
    usage: "/confession <send/setup/toggle/status> [args]",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const guildId = event.communityId || "default";

        const subcommand = args[0]?.toLowerCase();
        const enabledSetting = db.prepare(
            "SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'confession_enabled'"
        ).get(guildId) as any;
        const channelSetting = db.prepare(
            "SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'confession_channel_id'"
        ).get(guildId) as any;
        const isEnabled = enabledSetting?.value !== "0";

        if (subcommand === "setup") {
            const channelId = args[1];
            if (!channelId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/confession setup <channel_id>`\nPaste the ID of the channel where confessions should be posted.",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "confession_channel_id", channelId);
            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "confession_enabled", "1");

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `✅ Confessions will now be posted to <${channelId}>.`,
            });
            return;
        }

        if (subcommand === "toggle") {
            const value = args[1]?.toLowerCase();
            if (value !== "on" && value !== "off" && value !== "true" && value !== "false") {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/confession toggle <on|off>`",
                });
                return;
            }

            db.prepare("INSERT OR REPLACE INTO guild_settings (guild_id, key, value) VALUES (?, ?, ?)")
                .run(guildId, "confession_enabled", (value === "on" || value === "true") ? "1" : "0");

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `💭 Confessions ${(value === "on" || value === "true") ? "enabled" : "disabled"}.`,
            });
            return;
        }

        if (subcommand === "status") {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `💭 **Confession Settings**\nStatus: ${isEnabled ? "Enabled" : "Disabled"}\nChannel: ${channelSetting?.value ? `<${channelSetting.value}>` : "Not configured"}`,
            });
            return;
        }

        const message = subcommand === "send" ? args.slice(1).join(" ") : args.join(" ");
        if (!message) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/confession send <message>`",
            });
            return;
        }

        if (!channelSetting?.value) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Confessions are not set up yet.",
            });
            return;
        }

        if (!isEnabled) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Confessions are currently disabled.",
            });
            return;
        }

        // Look up the configured confessions channel; fall back to current channel
        const targetChannelId: string = channelSetting.value;

        // Delete the invoker's message to preserve anonymity
        try {
            await rootServer.community.channelMessages.delete({
                channelId: event.channelId,
                id: event.id,
            });
        } catch {
            // Ignore — bot may lack delete permission
        }

        await rootServer.community.channelMessages.create({
            channelId: targetChannelId as unknown as ChannelGuid,
            content: `🤐 **Anonymous Confession:**\n\n"${message}"`,
        });
    }
};

export const giveawayCommand: Command = {
    name: "giveaway",
    description: "Start a giveaway",
    usage: "/giveaway <start/end/reroll/list> [args]",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const subcommand = args[0]?.toLowerCase();

        if (!subcommand) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/giveaway start <time> <prize>` · `/giveaway end <message_id>` · `/giveaway reroll <message_id>` · `/giveaway list`",
            });
            return;
        }

        if (subcommand === "list") {
            const giveaways = db.prepare("SELECT * FROM giveaways WHERE guild_id = ? AND ended = 0 ORDER BY end_time ASC")
                .all(event.communityId || "default") as any[];

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: giveaways.length > 0
                    ? `🎉 **Active Giveaways**\n${giveaways.map((g: any) => `• \`${g.message_id}\` - ${g.prize} (ends in ${formatTimeLeft(g.end_time - Date.now())})`).join("\n")}`
                    : "No active giveaways in this community.",
            });
            return;
        }

        if (subcommand === "end") {
            const messageId = args[1];
            if (!messageId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/giveaway end <message_id>`",
                });
                return;
            }

            const error = await pickGiveawayWinners(event.channelId, messageId, true);
            if (error) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: error,
                });
            }
            return;
        }

        if (subcommand === "reroll") {
            const messageId = args[1];
            if (!messageId) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Usage: `/giveaway reroll <message_id>`",
                });
                return;
            }

            const giveaway = db.prepare("SELECT * FROM giveaways WHERE message_id = ?").get(messageId) as any;
            if (!giveaway) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "Giveaway not found.",
                });
                return;
            }

            const entries = db.prepare("SELECT user_id FROM giveaway_entries WHERE giveaway_message_id = ?").all(messageId) as Array<{ user_id: string }>;
            if (entries.length === 0) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: "No entries to reroll from.",
                });
                return;
            }

            const winner = entries[Math.floor(Math.random() * entries.length)]!.user_id;
            db.prepare("UPDATE giveaways SET winners = ? WHERE message_id = ?").run(winner, messageId);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `🎉 New winner for **${giveaway.prize}**: <@${winner}>`,
            });
            return;
        }

        if (subcommand !== "start" || args.length < 3) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/giveaway start <time> <prize>`",
            });
            return;
        }

        const timeStr = args[1];
        const prize = args.slice(2).join(" ");
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

        await pickGiveawayWinners(channelId, messageId, true);

    } catch (e) {
        console.error("Error handling giveaway job:", e);
    }
}
