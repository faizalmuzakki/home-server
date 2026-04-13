import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";
import { isAdmin, PERMISSION_DENIED } from "../permissions";
import {
    getOverview,
    formatOverview,
    listContainers,
    formatContainerList,
    getContainerStats,
    formatContainerStats,
    getContainerLogs,
    restartContainer,
} from "../../lib/serverInfo";

const MAX_MSG = 1900;
const truncate = (text: string) =>
    text.length > MAX_MSG ? text.slice(0, MAX_MSG) + "\n…(truncated)" : text;

async function send(channelId: unknown, content: string): Promise<void> {
    await rootServer.community.channelMessages.create({ channelId: channelId as any, content });
}

const USAGE =
    "Usage: `/server <status|containers|stats|logs|restart> [name] [lines]`";

export const serverCommand: Command = {
    name: "server",
    description: "Home server admin — status, containers, logs, restart (admin only)",
    usage: USAGE,
    category: "Moderation",
    execute: async (context: CommandContext) => {
        const { event, args } = context;

        if (!isAdmin(event.userId)) {
            await send(event.channelId, PERMISSION_DENIED);
            return;
        }

        const sub = (args[0] || "").toLowerCase();

        try {
            if (sub === "status" || sub === "") {
                const overview = await getOverview();
                await send(event.channelId, `🖥️ **Server status**\n${formatOverview(overview)}`);
                return;
            }

            if (sub === "containers") {
                const containers = await listContainers();
                const body = truncate(formatContainerList(containers));
                await send(event.channelId, `📦 **Containers (${containers.length})**\n${body}`);
                return;
            }

            if (sub === "stats") {
                const name = args[1];
                if (!name) {
                    await send(event.channelId, "Usage: `/server stats <container-name>`");
                    return;
                }
                const stats = await getContainerStats(name);
                await send(event.channelId, `📊 **${name}**\n${formatContainerStats(stats)}`);
                return;
            }

            if (sub === "logs") {
                const name = args[1];
                if (!name) {
                    await send(event.channelId, "Usage: `/server logs <container-name> [lines]`");
                    return;
                }
                const lines = Math.max(1, Math.min(200, parseInt(args[2] || "50", 10) || 50));
                const logs = await getContainerLogs(name, lines);
                const body = logs.trim() || "(no output)";
                await send(
                    event.channelId,
                    `**Logs — \`${name}\`** (last ${lines} lines)\n\`\`\`\n${truncate(body)}\n\`\`\``,
                );
                return;
            }

            if (sub === "restart") {
                const name = args[1];
                if (!name) {
                    await send(event.channelId, "Usage: `/server restart <container-name>`");
                    return;
                }
                await restartContainer(name);
                await send(event.channelId, `♻️ Restart triggered for \`${name}\`.`);
                return;
            }

            await send(event.channelId, USAGE);
        } catch (error) {
            console.error("/server error:", error);
            const msg = error instanceof Error ? error.message : String(error);
            await send(event.channelId, `❌ \`${sub || "status"}\` failed: ${msg.slice(0, 500)}`);
        }
    },
};
