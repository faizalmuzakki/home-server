import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

function parseDateTime(dateStr: string): Date | null {
    const direct = new Date(dateStr);
    if (!Number.isNaN(direct.getTime())) {
        return direct;
    }

    const yyyyMmDdHhMm = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
    if (yyyyMmDdHhMm) {
        return new Date(
            Number(yyyyMmDdHhMm[1]),
            Number(yyyyMmDdHhMm[2]) - 1,
            Number(yyyyMmDdHhMm[3]),
            Number(yyyyMmDdHhMm[4]),
            Number(yyyyMmDdHhMm[5])
        );
    }

    const ddMmYyyyHhMm = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (ddMmYyyyHhMm) {
        return new Date(
            Number(ddMmYyyyHhMm[3]),
            Number(ddMmYyyyHhMm[2]) - 1,
            Number(ddMmYyyyHhMm[1]),
            Number(ddMmYyyyHhMm[4]),
            Number(ddMmYyyyHhMm[5])
        );
    }

    const yyyyMmDd = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (yyyyMmDd) {
        return new Date(Number(yyyyMmDd[1]), Number(yyyyMmDd[2]) - 1, Number(yyyyMmDd[3]), 0, 0, 0);
    }

    const ddMmYyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddMmYyyy) {
        return new Date(Number(ddMmYyyy[3]), Number(ddMmYyyy[2]) - 1, Number(ddMmYyyy[1]), 0, 0, 0);
    }

    return null;
}

function formatCountdown(ms: number): string {
    const isNegative = ms < 0;
    const abs = Math.abs(ms);
    const seconds = Math.floor(abs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    const parts: string[] = [];

    if (years > 0) {
        parts.push(`${years} year${years !== 1 ? "s" : ""}`);
        const remainingMonths = Math.floor((days % 365) / 30);
        if (remainingMonths > 0) parts.push(`${remainingMonths} month${remainingMonths !== 1 ? "s" : ""}`);
    } else if (months > 0) {
        parts.push(`${months} month${months !== 1 ? "s" : ""}`);
        const remainingDays = days % 30;
        if (remainingDays > 0) parts.push(`${remainingDays} day${remainingDays !== 1 ? "s" : ""}`);
    } else if (weeks > 0) {
        parts.push(`${weeks} week${weeks !== 1 ? "s" : ""}`);
        const remainingDays = days % 7;
        if (remainingDays > 0) parts.push(`${remainingDays} day${remainingDays !== 1 ? "s" : ""}`);
    } else if (days > 0) {
        parts.push(`${days} day${days !== 1 ? "s" : ""}`);
        const remainingHours = hours % 24;
        if (remainingHours > 0) parts.push(`${remainingHours} hour${remainingHours !== 1 ? "s" : ""}`);
    } else if (hours > 0) {
        parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
        const remainingMinutes = minutes % 60;
        if (remainingMinutes > 0) parts.push(`${remainingMinutes} minute${remainingMinutes !== 1 ? "s" : ""}`);
    } else if (minutes > 0) {
        parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
        const remainingSeconds = seconds % 60;
        if (remainingSeconds > 0) parts.push(`${remainingSeconds} second${remainingSeconds !== 1 ? "s" : ""}`);
    } else {
        parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
    }

    const text = parts.join(", ");
    return isNegative ? `${text} ago` : text;
}

export const countdownCommand: Command = {
    name: "countdown",
    description: "Calculate the time until a given date/time",
    usage: "/countdown <datetime>",
    category: "Productivity",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const input = args.join(" ").trim();

        if (!input) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/countdown <datetime>`\nExamples: `2026-12-25 15:30`, `2026-12-25`, `25/12/2026 15:30`, `Dec 25, 2026`",
            });
            return;
        }

        const targetDate = parseDateTime(input);
        if (!targetDate || Number.isNaN(targetDate.getTime())) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Invalid date format. Try `2026-12-25 15:30`, `2026-12-25`, `25/12/2026 15:30`, `25/12/2026`, or `Dec 25, 2026`.",
            });
            return;
        }

        const diffMs = targetDate.getTime() - Date.now();
        const label = diffMs < 0 ? "Time elapsed" : "Time remaining";

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `⏳ **Countdown**\nTarget: ${targetDate.toLocaleString()}\n${label}: **${formatCountdown(diffMs)}**`,
        });
    }
};
