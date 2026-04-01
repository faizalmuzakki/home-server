import { rootServer } from "@rootsdk/server-bot";
import Anthropic from "@anthropic-ai/sdk";
import { Command, CommandContext } from "../Command";
import { CONFIG } from "../../config";

function formatLang(lang: string): string {
    return lang.replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

export const translateCommand: Command = {
    name: "translate",
    description: "Translate text to another language",
    usage: "/translate <to-language> | <text> [| <from-language|auto>]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const full = args.join(" ");
        const parts = full.split("|").map(part => part.trim()).filter(Boolean);
        const targetLang = parts[0];
        const text = parts[1];
        const sourceLang = parts[2] || "auto";

        if (!targetLang || !text) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/translate <to-language> | <text> [| <from-language|auto>]`",
            });
            return;
        }

        if (!CONFIG.ANTHROPIC_API_KEY) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Anthropic API key is not configured.",
            });
            return;
        }

        const anthropic = new Anthropic({ apiKey: CONFIG.ANTHROPIC_API_KEY });

        try {
            const prompt = sourceLang === "auto"
                ? `Translate this text to ${formatLang(targetLang)}. First detect the source language.\n\nText: ${text}\n\nRespond in this format:\nDetected language: [language]\nTranslation: [translated text]`
                : `Translate this text from ${formatLang(sourceLang)} to ${formatLang(targetLang)}.\n\nText: ${text}\n\nRespond with only the translation.`;

            const response = await anthropic.messages.create({
                model: "claude-3-5-haiku-20241022",
                max_tokens: 800,
                system: "You are a professional translator. Preserve meaning and tone.",
                messages: [{ role: "user", content: prompt }],
            });

            const result = (response.content[0] as any).text as string;
            const detected = sourceLang === "auto"
                ? result.match(/Detected language:\s*(.+)/i)?.[1]?.trim() || "Unknown"
                : formatLang(sourceLang);
            const translation = sourceLang === "auto"
                ? result.match(/Translation:\s*([\s\S]+)/i)?.[1]?.trim() || result.trim()
                : result.trim();

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**Translation**\nFrom: ${detected}\nTo: ${formatLang(targetLang)}\n\n${translation}`,
            });
        } catch (error) {
            console.error("Translate command error:", error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Failed to translate text.",
            });
        }
    }
};
