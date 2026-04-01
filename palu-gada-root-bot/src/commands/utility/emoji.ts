import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

const KNOWN_EMOJI_NAMES: Record<string, string> = {
    "😀": "Grinning Face",
    "😂": "Face with Tears of Joy",
    "❤️": "Red Heart",
    "👍": "Thumbs Up",
    "👎": "Thumbs Down",
    "🎉": "Party Popper",
    "🔥": "Fire",
    "⭐": "Star",
    "💀": "Skull",
    "👀": "Eyes",
    "🤔": "Thinking Face",
    "😎": "Smiling Face with Sunglasses",
};

export const emojiCommand: Command = {
    name: "emoji",
    description: "Get basic information about an emoji",
    usage: "/emoji <emoji>",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const input = args.join(" ").trim();

        if (!input) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/emoji <emoji>`",
            });
            return;
        }

        const codePoints = [...input].map(char => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);
        const jsEscape = [...input].map(char => `\\u{${char.codePointAt(0)!.toString(16)}}`).join("");
        const htmlEntity = [...input].map(char => `&#x${char.codePointAt(0)!.toString(16)};`).join("");
        const twemojiCodePoints = [...input].map(char => char.codePointAt(0)!.toString(16)).join("-").replace(/-fe0f/g, "");
        const previewUrl = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14/assets/72x72/${twemojiCodePoints}.png`;

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `**Emoji Info: ${input}**\nName: ${KNOWN_EMOJI_NAMES[input] || "Unicode Character"}\nCode points: ${codePoints.join(" ")}\nJavaScript: \`${jsEscape}\`\nHTML: \`${htmlEntity}\`\nPreview: ${previewUrl}`,
        });
    }
};
