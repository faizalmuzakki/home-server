import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

export const qrcodeCommand: Command = {
    name: "qrcode",
    description: "Generate a QR code link for text or a URL",
    usage: "/qrcode <text> [size]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const sizeCandidate = Number(args[args.length - 1]);
        const size = Number.isFinite(sizeCandidate) && [150, 300, 500].includes(sizeCandidate) ? sizeCandidate : 300;
        const text = (Number.isFinite(sizeCandidate) && [150, 300, 500].includes(sizeCandidate) ? args.slice(0, -1) : args).join(" ").trim();

        if (!text) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/qrcode <text> [150|300|500]`",
            });
            return;
        }

        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&format=png`;
        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `**QR Code Generated**\nText: ${text.length > 100 ? `${text.slice(0, 100)}...` : text}\nQR: ${qrUrl}`,
        });
    }
};
