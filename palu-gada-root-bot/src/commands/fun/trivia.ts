import { JobData, JobInterval, rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

const CATEGORIES: Record<string, number> = {
    general: 9,
    science_nature: 17,
    computers: 18,
    video_games: 15,
    film: 11,
    music: 12,
    television: 14,
    history: 23,
    geography: 22,
    sports: 21,
    anime_manga: 31,
    animals: 27,
    mythology: 20,
    art: 25,
};

function decodeHTML(text: string): string {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#039;|&apos;/g, "'");
}

function shuffle<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export const triviaCommand: Command = {
    name: "trivia",
    description: "Start a simple trivia round",
    usage: "/trivia [category] [difficulty]",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const category = args[0]?.toLowerCase();
        const difficulty = args[1]?.toLowerCase();

        let url = "https://opentdb.com/api.php?amount=1&type=multiple";
        if (category && CATEGORIES[category]) {
            url += `&category=${CATEGORIES[category]}`;
        }
        if (difficulty && ["easy", "medium", "hard"].includes(difficulty)) {
            url += `&difficulty=${difficulty}`;
        }

        try {
            const response = await fetch(url);
            const data = await response.json() as any;
            const question = data.results?.[0];
            if (!question) {
                throw new Error("No trivia question available");
            }

            const correct = decodeHTML(question.correct_answer);
            const answers = shuffle([correct, ...question.incorrect_answers.map((answer: string) => decodeHTML(answer))]);
            const letters = ["A", "B", "C", "D"];
            const correctLetter = letters[answers.indexOf(correct)];

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**Trivia Time**\nCategory: ${decodeHTML(question.category)}\nDifficulty: ${question.difficulty}\n\n${decodeHTML(question.question)}\n\n${answers.map((answer, index) => `**${letters[index]}.** ${answer}`).join("\n")}\n\nReply with A, B, C, or D in the next 30 seconds.`,
            });

            await rootServer.jobScheduler.create({
                resourceId: event.userId,
                tag: `trivia:${JSON.stringify({ cid: event.channelId, answer: correctLetter, correct })}`,
                start: new Date(Date.now() + 30_000),
                jobInterval: JobInterval.OneTime,
            });
        } catch (error) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to fetch a trivia question.",
            });
        }
    }
};

export async function handleTriviaJob(job: JobData) {
    if (!job.tag?.startsWith("trivia:")) return;

    try {
        const payload = JSON.parse(job.tag.substring("trivia:".length)) as { cid: string; answer: string; correct: string };
        await rootServer.community.channelMessages.create({
            channelId: payload.cid as any,
            content: `**Trivia Answer**\nCorrect answer: **${payload.answer}**. ${payload.correct}`,
        });
    } catch (error) {
        console.error("Trivia job error:", error);
    }
}
