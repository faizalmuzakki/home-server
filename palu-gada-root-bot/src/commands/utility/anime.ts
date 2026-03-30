import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

const JIKAN_BASE = "https://api.jikan.moe/v4";

function capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatEntry(entry: any, type: "anime" | "manga"): string {
    const title = entry.title_english || entry.title;
    const japanese = entry.title_japanese && entry.title_japanese !== title ? ` (${entry.title_japanese})` : "";
    const score = entry.score ? `⭐ ${entry.score}/10` : "N/A";
    const rank = entry.rank ? `#${entry.rank}` : "N/A";
    const genres = entry.genres?.map((g: any) => g.name).slice(0, 4).join(", ") || "Unknown";
    const synopsis = (entry.synopsis || "No synopsis available.")
        .replace(/\[Written by MAL Rewrite\]/gi, "")
        .trim()
        .slice(0, 300);

    const icon = type === "manga" ? "📚" : "🎌";
    let info: string;

    if (type === "manga") {
        info = [
            `**Type:** ${entry.type || "Unknown"}`,
            `**Chapters:** ${entry.chapters ?? "?"}`,
            `**Volumes:** ${entry.volumes ?? "?"}`,
            `**Status:** ${entry.status || "Unknown"}`,
        ].join(" · ");
    } else {
        const season = entry.season && entry.year
            ? `${capitalize(entry.season)} ${entry.year}`
            : entry.year || "Unknown";
        info = [
            `**Type:** ${entry.type || "Unknown"}`,
            `**Episodes:** ${entry.episodes ?? "?"}`,
            `**Status:** ${entry.status || "Unknown"}`,
            `**Season:** ${season}`,
        ].join(" · ");
    }

    return [
        `${icon} **${title}**${japanese}`,
        info,
        `**Score:** ${score} · **Rank:** ${rank}`,
        `**Genres:** ${genres}`,
        ``,
        synopsis + (synopsis.length >= 300 ? "…" : ""),
        ``,
        `🔗 ${entry.url}`,
    ].join("\n");
}

export const animeCommand: Command = {
    name: "anime",
    description: "Search MyAnimeList for an anime",
    usage: "/anime <title>",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const query = args.join(" ").trim();

        if (!query) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/anime <title>`",
            });
            return;
        }

        try {
            const res = await fetch(
                `${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=3&sfw=false`,
                { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) }
            );
            if (!res.ok) throw new Error(`Jikan error ${res.status}`);
            const json = await res.json() as any;
            const results = json.data;

            if (!results?.length) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `No anime found for **${query}** on MyAnimeList.`,
                });
                return;
            }

            const content = formatEntry(results[0], "anime");
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: content.slice(0, 2000),
            });
        } catch (error) {
            console.error("Anime command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to fetch from MyAnimeList. Try again later.",
            });
        }
    },
};

export const mangaCommand: Command = {
    name: "manga",
    description: "Search MyAnimeList for a manga",
    usage: "/manga <title>",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const query = args.join(" ").trim();

        if (!query) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/manga <title>`",
            });
            return;
        }

        try {
            const res = await fetch(
                `${JIKAN_BASE}/manga?q=${encodeURIComponent(query)}&limit=3`,
                { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) }
            );
            if (!res.ok) throw new Error(`Jikan error ${res.status}`);
            const json = await res.json() as any;
            const results = json.data;

            if (!results?.length) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `No manga found for **${query}** on MyAnimeList.`,
                });
                return;
            }

            const content = formatEntry(results[0], "manga");
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: content.slice(0, 2000),
            });
        } catch (error) {
            console.error("Manga command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to fetch from MyAnimeList. Try again later.",
            });
        }
    },
};
