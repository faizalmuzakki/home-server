import { rootServer, JobInterval, JobData } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

const MAX_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
const TAG_PREFIX = "schedule:";

function parseTimeString(timeStr: string): number {
    const regex = /(\d+)\s*(w|d|h|m|s)/gi;
    let totalMs = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(timeStr)) !== null) {
        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();
        switch (unit) {
            case "w": totalMs += value * 7 * 24 * 60 * 60 * 1000; break;
            case "d": totalMs += value * 24 * 60 * 60 * 1000; break;
            case "h": totalMs += value * 60 * 60 * 1000; break;
            case "m": totalMs += value * 60 * 1000; break;
            case "s": totalMs += value * 1000; break;
        }
    }
    return totalMs;
}

async function send(channelId: unknown, content: string): Promise<void> {
    await rootServer.community.channelMessages.create({ channelId: channelId as any, content });
}

const USAGE = "Usage: `/schedule <time> <message>` (time like `1h30m`, `2d`, `30m`)";

export const scheduleCommand: Command = {
    name: "schedule",
    description: "Schedule a message to be posted in this channel",
    usage: USAGE,
    category: "Productivity",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const sub = (args[0] || "").toLowerCase();

        // /schedule list — show pending scheduled messages for this user
        if (sub === "list") {
            try {
                const jobs = await rootServer.jobScheduler.listByResourceId(event.userId);
                const mine = jobs.filter((j) => j.tag?.startsWith(TAG_PREFIX));

                if (mine.length === 0) {
                    await send(event.channelId, "You have no pending scheduled messages.");
                    return;
                }

                const lines = mine.slice(0, 10).map((j, i) => {
                    try {
                        const payload = JSON.parse(j.tag!.substring(TAG_PREFIX.length));
                        const when = j.start ? new Date(j.start).toISOString().replace("T", " ").slice(0, 16) : "?";
                        const snippet = payload.msg.length > 60 ? payload.msg.slice(0, 60) + "…" : payload.msg;
                        return `**${i + 1}.** \`${j.jobScheduleId.slice(0, 8)}\` → ${when} UTC\n> ${snippet}`;
                    } catch {
                        return `**${i + 1}.** \`${j.jobScheduleId.slice(0, 8)}\` (malformed)`;
                    }
                }).join("\n\n");

                await send(event.channelId, `📅 **Your scheduled messages** (${mine.length} total)\n\n${lines}`);
            } catch (error) {
                console.error("/schedule list error:", error);
                await send(event.channelId, "Failed to list scheduled messages.");
            }
            return;
        }

        // /schedule cancel <short-id>
        if (sub === "cancel") {
            const shortId = args[1];
            if (!shortId) {
                await send(event.channelId, "Usage: `/schedule cancel <id-prefix>` (use the id shown in `/schedule list`)");
                return;
            }
            try {
                const jobs = await rootServer.jobScheduler.listByResourceId(event.userId);
                const target = jobs.find((j) => j.tag?.startsWith(TAG_PREFIX) && j.jobScheduleId.startsWith(shortId));
                if (!target) {
                    await send(event.channelId, `No scheduled message matching \`${shortId}\`.`);
                    return;
                }
                await rootServer.jobScheduler.delete(target.jobScheduleId);
                await send(event.channelId, `✅ Cancelled scheduled message \`${target.jobScheduleId.slice(0, 8)}\`.`);
            } catch (error) {
                console.error("/schedule cancel error:", error);
                await send(event.channelId, "Failed to cancel scheduled message.");
            }
            return;
        }

        // /schedule <time> <message> — default: add
        const timeStr = args[0];
        const message = args.slice(1).join(" ");

        if (!timeStr || !message) {
            await send(event.channelId, USAGE + "\nSubcommands: `/schedule list`, `/schedule cancel <id>`");
            return;
        }

        const durationMs = parseTimeString(timeStr);
        if (durationMs === 0) {
            await send(event.channelId, "Invalid duration. Use formats like `1h30m`, `2d`, `30m`.");
            return;
        }
        if (durationMs > MAX_WINDOW_MS) {
            await send(event.channelId, "Maximum schedule window is 365 days.");
            return;
        }

        const sendAt = new Date(Date.now() + durationMs);
        const payload = JSON.stringify({
            cid: event.channelId,
            msg: message,
            uid: event.userId,
        });

        try {
            await rootServer.jobScheduler.create({
                resourceId: event.userId,
                tag: `${TAG_PREFIX}${payload}`,
                start: sendAt,
                jobInterval: JobInterval.OneTime,
            });
            const when = sendAt.toISOString().replace("T", " ").slice(0, 16);
            await send(event.channelId, `📅 Scheduled for **${when} UTC** (in ${timeStr}): ${message}`);
        } catch (error) {
            console.error("/schedule create error:", error);
            await send(event.channelId, "Failed to schedule message.");
        }
    },
};

export async function handleScheduleJob(job: JobData): Promise<void> {
    if (!job.tag?.startsWith(TAG_PREFIX)) return;
    try {
        const payload = JSON.parse(job.tag.substring(TAG_PREFIX.length));
        await rootServer.community.channelMessages.create({
            channelId: payload.cid,
            content: `📅 Scheduled message from <@${payload.uid}>:\n${payload.msg}`,
        });
    } catch (e) {
        console.error("Error handling schedule job:", e);
    }
}
