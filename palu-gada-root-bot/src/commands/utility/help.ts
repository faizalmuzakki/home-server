import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

export const helpCommand: Command = {
    name: "help",
    description: "List all available commands or get details on one",
    aliases: ["h", "commands"],
    usage: "/help [command]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;

        // Use a dynamic import to avoid a circular dependency with handler.ts
        const { getCommands } = await import("../handler.js");
        const allCommands = getCommands();

        const commandName = args[0]?.toLowerCase();

        if (commandName) {
            const cmd = allCommands.get(commandName);
            if (!cmd) {
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `❌ Command \`/${commandName}\` not found. Use \`/help\` to see all commands.`,
                });
                return;
            }

            const lines = [
                `**/${cmd.name}**`,
                cmd.description,
                `**Usage:** \`${cmd.usage ?? `/${cmd.name}`}\``,
            ];
            if (cmd.aliases?.length) {
                lines.push(`**Aliases:** ${cmd.aliases.map(a => `\`/${a}\``).join(", ")}`);
            }

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: lines.join("\n"),
            });
            return;
        }

        // Group commands by category
        const categories = new Map<string, Command[]>();
        for (const cmd of allCommands.values()) {
            const cat = cmd.category ?? "Misc";
            if (!categories.has(cat)) categories.set(cat, []);
            categories.get(cat)!.push(cmd);
        }

        const lines: string[] = ["📖 **Available Commands**\n"];
        for (const [cat, cmds] of [...categories.entries()].sort()) {
            lines.push(`**${cat}**`);
            for (const cmd of cmds.sort((a, b) => a.name.localeCompare(b.name))) {
                lines.push(`  \`/${cmd.name}\` — ${cmd.description}`);
            }
            lines.push("");
        }
        lines.push("_Use \`/help <command>\` for details on a specific command._");

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: lines.join("\n"),
        });
    },
};
