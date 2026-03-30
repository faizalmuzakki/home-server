import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

const KURYANA_BASE = "https://kuryana.vercel.app";
const MDL_BASE = "https://mydramalist.com";

export const dramaCommand: Command = {
    name: "drama",
    description: "Search MyDramaList for a drama, movie, or variety show",
    usage: "/drama <title>",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const query = args.join(" ").trim();

        if (!query) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/drama <title>`",
            });
            return;
        }

        try {
            // Step 1: search
            const searchRes = await fetch(
                `${KURYANA_BASE}/search/q/${encodeURIComponent(query)}`,
                { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) }
            );
            if (!searchRes.ok) throw new Error(`Kuryana search error ${searchRes.status}`);
            const searchJson = await searchRes.json() as any;
            const results = searchJson.results;

            if (!results?.length) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `No results found on MyDramaList for **${query}**.`,
                });
                return;
            }

            const top = results[0];

            // Step 2: fetch details
            let data: any = top;
            try {
                const detailRes = await fetch(
                    `${KURYANA_BASE}/id/${encodeURIComponent(top.slug)}`,
                    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000) }
                );
                if (detailRes.ok) {
                    const detail = await detailRes.json() as any;
                    data = { ...top, ...detail.data };
                }
            } catch {
                // Fall back to search result data
            }

            const title = data.title || top.title;
            const type = data.type || top.type || "Drama";
            const country = data.country || top.country || "";
            const year = data.year || top.year || "";
            const rating = data.rating ? `⭐ ${data.rating}/10` : null;
            const episodes = data.episodes ? `${data.episodes} ep` : null;
            const status = data.status || "";
            const genres = Array.isArray(data.genres)
                ? data.genres.map((g: any) => (typeof g === "string" ? g : g.name)).slice(0, 4).join(", ")
                : "";
            const synopsis = (data.synopsis || data.description || "No synopsis available.")
                .trim()
                .slice(0, 300);
            const slug = top.slug || "";
            const url = slug ? `${MDL_BASE}/${slug}` : `${MDL_BASE}/search?q=${encodeURIComponent(query)}`;

            const metaParts = [type, country, year].filter(Boolean).join(" · ");
            const statsParts = [rating, episodes, status].filter(Boolean).join(" · ");

            const lines = [
                `🎬 **${title}**`,
                metaParts,
                statsParts || null,
                genres ? `**Genres:** ${genres}` : null,
                "",
                synopsis + (synopsis.length >= 300 ? "…" : ""),
                "",
                `🔗 ${url}`,
            ].filter(s => s !== null).join("\n");

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: lines.slice(0, 2000),
            });
        } catch (error) {
            console.error("Drama command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to fetch from MyDramaList. Try again later.",
            });
        }
    },
};
