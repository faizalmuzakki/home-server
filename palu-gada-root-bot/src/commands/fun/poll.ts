import { rootServer, JobInterval, JobData, ChannelGuid } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

function parseDurationFlag(input: string): { text: string; durationMs: number | null } {
    const match = input.match(/\s+--duration\s+(\d+)([mh])\s*$/i);
    if (!match) {
        return { text: input.trim(), durationMs: null };
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const durationMs = unit === "h" ? value * 60 * 60 * 1000 : value * 60 * 1000;
    return {
        text: input.slice(0, match.index).trim(),
        durationMs,
    };
}

function buildResults(question: string, options: string[], reactions: Array<{ shortcode: string; userId: string }>): string {
    const isYesNo = options.length === 0;
    const resultRows = isYesNo
        ? [
            { label: "Yes 👍", emoji: "👍", votes: 0 },
            { label: "No 👎", emoji: "👎", votes: 0 },
        ]
        : options.map((option, index) => ({
            label: option,
            emoji: NUMBER_EMOJIS[index],
            votes: 0,
        }));

    for (const row of resultRows) {
        row.votes = reactions.filter(reaction => reaction.shortcode === row.emoji).length;
    }

    const totalVotes = resultRows.reduce((sum, row) => sum + row.votes, 0);
    const sortedRows = [...resultRows].sort((a, b) => b.votes - a.votes);

    return `📊 **Poll Results**\n\n**${question}**\n\n${sortedRows.map(row => {
        const percentage = totalVotes > 0 ? Math.round((row.votes / totalVotes) * 100) : 0;
        const bar = "█".repeat(Math.floor(percentage / 10)) + "░".repeat(10 - Math.floor(percentage / 10));
        return `${row.emoji} **${row.label}**\n${bar} ${percentage}% (${row.votes} vote${row.votes !== 1 ? "s" : ""})`;
    }).join("\n\n")}\n\n_Poll ended_`;
}

export const pollCommand: Command = {
    name: "poll",
    description: "Create a poll",
    usage: "/poll <question> | [option1] | [option2] | ... [--duration 10m]",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;

        if (args.length === 0) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/poll <question>` for a Yes/No poll\nOr: `/poll <question> | option1 | option2 | ...` for multiple choice (up to 10 options)",
            });
            return;
        }

        // Reconstruct full text from args, with an optional trailing duration flag.
        const durationParse = parseDurationFlag(args.join(" "));
        const fullText = durationParse.text;
        const durationMs = durationParse.durationMs;
        const parts = fullText.split("|").map(p => p.trim()).filter(p => p.length > 0);

        const question = parts[0];
        const options = parts.slice(1);

        if (!question) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Please provide a poll question.",
            });
            return;
        }

        if (options.length === 1) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "You need at least 2 options (or none for a Yes/No poll).",
            });
            return;
        }

        if (options.length > 10) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Maximum 10 options allowed.",
            });
            return;
        }

        const isYesNo = options.length === 0;

        let content: string;

        if (isYesNo) {
            content = `📊 **Poll by <@${event.userId}>**\n\n**${question}**\n\n👍 Yes  ·  👎 No\n\n_React to vote!_`;
        } else {
            const optionLines = options.map((opt, i) => `${NUMBER_EMOJIS[i]} ${opt}`).join("\n");
            content = `📊 **Poll by <@${event.userId}>**\n\n**${question}**\n\n${optionLines}\n\n_React to vote!_`;
        }

        if (durationMs) {
            content += `\n\nEnds in ${Math.round(durationMs / 60000)} minute${Math.round(durationMs / 60000) !== 1 ? "s" : ""}.`;
        }

        const msg = await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content,
        });

        // Add reaction prompts
        const reactions = isYesNo ? ["👍", "👎"] : options.map((_, i) => NUMBER_EMOJIS[i]);
        for (const emoji of reactions) {
            try {
                await rootServer.community.channelMessages.reactionCreate({
                    channelId: event.channelId,
                    messageId: msg.id,
                    shortcode: emoji,
                });
            } catch {
                // Ignore — reaction may not be supported
            }
        }

        if (durationMs) {
            const payload = JSON.stringify({
                cid: event.channelId,
                mid: msg.id,
                q: question,
                o: options,
            });

            await rootServer.jobScheduler.create({
                resourceId: event.userId,
                tag: `poll:${payload}`,
                start: new Date(Date.now() + durationMs),
                jobInterval: JobInterval.OneTime,
            });
        }
    }
};

export async function handlePollJob(job: JobData) {
    if (!job.tag?.startsWith("poll:")) return;

    try {
        const payload = JSON.parse(job.tag.substring("poll:".length)) as {
            cid: string;
            mid: string;
            q: string;
            o: string[];
        };

        const message = await rootServer.community.channelMessages.get({
            channelId: payload.cid as unknown as ChannelGuid,
            id: payload.mid as any,
        });

        const resultsContent = buildResults(
            payload.q,
            payload.o ?? [],
            (message.reactions ?? []).map(reaction => ({
                shortcode: reaction.shortcode,
                userId: reaction.userId,
            }))
        );

        await rootServer.community.channelMessages.edit({
            channelId: payload.cid as unknown as ChannelGuid,
            id: payload.mid as any,
            content: resultsContent,
        });
    } catch (error) {
        console.error("Error handling poll job:", error);
    }
}
