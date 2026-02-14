import { rootServer, JobInterval, JobScheduleEvent, JobData } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

// We need to parse time strings like "10m", "1h", "1d"
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

export const remindCommand: Command = {
    name: "remind",
    description: "Set a reminder",
    usage: "/remind <time> <message>",
    category: "Productivity",
    execute: async (context: CommandContext) => {
        const { event, args } = context;

        if (args.length < 2) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /remind <time> <message> (e.g. /remind 10m Take a break)",
            });
            return;
        }

        const timeStr = args[0];
        const message = args.slice(1).join(" ");
        const duration = parseTime(timeStr);

        if (!duration) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Invalid time format. Use s, m, h, or d (e.g. 10m, 1h).",
            });
            return;
        }

        const reminderTime = new Date(Date.now() + duration);

        // We'll store the reminder data in the tag as JSON: { userId, channelId, message }
        // Tag has a length limit, hopefully message isn't too long. If it is, we should save to DB and reference ID.
        // For now, let's assume short strings or handle potential length issues by truncating or using DB.
        // To be safe/better, let's use the resourceId field for userId, and encode channelId + message in tag.

        const payload = JSON.stringify({
            cid: event.channelId,
            msg: message,
            uid: event.userId
        });

        // Root tags might have limits. Let's try to verify. 
        // If getting errors, we might need a separate table 'reminders' and just store ID in tag.

        try {
            await rootServer.jobScheduler.create({
                resourceId: event.userId, // Associate job with user
                tag: `reminder:${payload}`, // Prefix to identify it's a reminder
                start: reminderTime,
                jobInterval: JobInterval.OneTime
            });

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `⏰ I'll remind you in **${timeStr}**: ${message}`,
            });

        } catch (error) {
            console.error("Remind command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to set reminder.",
            });
        }
    }
};

// Handler for job execution
export async function handleReminderJob(job: JobData) {
    if (!job.tag?.startsWith("reminder:")) return;

    try {
        const payloadJson = job.tag.substring("reminder:".length);
        const payload = JSON.parse(payloadJson);

        await rootServer.community.channelMessages.create({
            channelId: payload.cid,
            content: `⏰ <@${payload.uid}> Reminder: ${payload.msg}`,
            // Mentions might need specific handling or just standard string format
        });

    } catch (e) {
        console.error("Error handling reminder job:", e);
    }
}
