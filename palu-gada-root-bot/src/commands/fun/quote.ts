import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

type Quote = { text: string; author: string };

const QUOTES: Record<string, Quote[]> = {
    inspirational: [
        { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
        { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
        { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
        { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
        { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
        { text: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
        { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
        { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
        { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
        { text: "Your time is limited, don't waste it living someone else's life.", author: "Steve Jobs" },
    ],
    wisdom: [
        { text: "The only true wisdom is in knowing you know nothing.", author: "Socrates" },
        { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
        { text: "The journey of a thousand miles begins with one step.", author: "Lao Tzu" },
        { text: "Knowledge speaks, but wisdom listens.", author: "Jimi Hendrix" },
        { text: "The fool doth think he is wise, but the wise man knows himself to be a fool.", author: "William Shakespeare" },
        { text: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
        { text: "Knowing yourself is the beginning of all wisdom.", author: "Aristotle" },
        { text: "The measure of intelligence is the ability to change.", author: "Albert Einstein" },
        { text: "It is not that I'm so smart. But I stay with the questions much longer.", author: "Albert Einstein" },
    ],
    funny: [
        { text: "I'm not lazy, I'm on energy-saving mode.", author: "Unknown" },
        { text: "I'm not arguing, I'm just explaining why I'm right.", author: "Unknown" },
        { text: "I used to think I was indecisive, but now I'm not so sure.", author: "Unknown" },
        { text: "I'm not great at advice. Can I interest you in a sarcastic comment?", author: "Chandler Bing" },
        { text: "Behind every great man is a woman rolling her eyes.", author: "Jim Carrey" },
        { text: "I'm sorry, if you were right, I'd agree with you.", author: "Robin Williams" },
        { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
        { text: "I'm writing a book. I've got the page numbers done.", author: "Steven Wright" },
        { text: "I intend to live forever. So far, so good.", author: "Steven Wright" },
    ],
    programming: [
        { text: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", author: "Martin Fowler" },
        { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
        { text: "Experience is the name everyone gives to their mistakes.", author: "Oscar Wilde" },
        { text: "Code is like humor. When you have to explain it, it's bad.", author: "Cory House" },
        { text: "Fix the cause, not the symptom.", author: "Steve Maguire" },
        { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
        { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
        { text: "Before software can be reusable it first has to be usable.", author: "Ralph Johnson" },
        { text: "The best error message is the one that never shows up.", author: "Thomas Fuchs" },
        { text: "Deleted code is debugged code.", author: "Jeff Sickel" },
        { text: "It's not a bug – it's an undocumented feature.", author: "Anonymous" },
        { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
    ],
    motivational: [
        { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
        { text: "Everything you've ever wanted is on the other side of fear.", author: "George Addair" },
        { text: "The harder you work for something, the greater you'll feel when you achieve it.", author: "Unknown" },
        { text: "Dream bigger. Do bigger.", author: "Unknown" },
        { text: "Don't stop when you're tired. Stop when you're done.", author: "Unknown" },
        { text: "Wake up with determination. Go to bed with satisfaction.", author: "Unknown" },
        { text: "Do something today that your future self will thank you for.", author: "Sean Patrick Flanery" },
        { text: "Little things make big days.", author: "Unknown" },
        { text: "It's going to be hard, but hard does not mean impossible.", author: "Unknown" },
        { text: "Don't wait for opportunity. Create it.", author: "Unknown" },
    ],
};

const EMOJI: Record<string, string> = {
    inspirational: "✨",
    wisdom: "🦉",
    funny: "😂",
    programming: "💻",
    motivational: "💪",
};

const CATEGORY_LIST = Object.keys(QUOTES).join(", ");

export const quoteCommand: Command = {
    name: "quote",
    description: "Get an inspirational, wise, funny, programming, or motivational quote",
    usage: `/quote [${Object.keys(QUOTES).join("|")}|random]`,
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const requested = (args[0] || "random").toLowerCase();
        const categories = Object.keys(QUOTES);

        let category: string;
        if (requested === "random" || !requested) {
            category = categories[Math.floor(Math.random() * categories.length)];
        } else if (categories.includes(requested)) {
            category = requested;
        } else {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `Unknown category \`${requested}\`. Try: ${CATEGORY_LIST}, or random.`,
            });
            return;
        }

        const pool = QUOTES[category];
        const q = pool[Math.floor(Math.random() * pool.length)];

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `${EMOJI[category]} *"${q.text}"*\n— **${q.author}** *(${category})*`,
        });
    },
};
