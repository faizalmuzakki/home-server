import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

export const rollCommand: Command = {
    name: "roll",
    description: "Roll dice",
    usage: "/roll [notation]",
    category: "Fun",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const diceInput = args[0] || 'd20';

        const diceRegex = /^(\d*)d(\d+)([+-]\d+)?$/i;
        const match = diceInput.toLowerCase().replace(/\s/g, '').match(diceRegex);

        if (!match) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: 'Invalid dice notation! Use format like `d20`, `2d6`, `3d8+5`, or `4d10-2`',
            });
            return;
        }

        const numDice = parseInt(match[1]) || 1;
        const diceSides = parseInt(match[2]);
        const modifier = parseInt(match[3]) || 0;

        if (numDice < 1 || numDice > 100 || diceSides < 2 || diceSides > 1000) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: 'Number of dice must be 1-100 and sides 2-1000.',
            });
            return;
        }

        const rolls: number[] = [];
        for (let i = 0; i < numDice; i++) {
            rolls.push(Math.floor(Math.random() * diceSides) + 1);
        }

        const sum = rolls.reduce((a, b) => a + b, 0);
        const total = sum + modifier;

        let response = `🎲 **Roll:** ${diceInput.toUpperCase()}\n`;
        if (numDice > 1) {
            const rollsDisplay = rolls.length <= 10 ? `[${rolls.join(", ")}]` : `[${rolls.slice(0, 10).join(", ")}...]`;
            response += `**Rolls:** ${rollsDisplay}\n**Sum:** ${sum}\n`;
        }
        
        if (modifier !== 0) {
            response += `**Modifier:** ${modifier > 0 ? "+" : ""}${modifier}\n`;
        }

        response += `## Total: ${total}`;

        if (numDice === 1 && diceSides === 20) {
            if (rolls[0] === 20) response += " 🎉 **CRITICAL SUCCESS!**";
            else if (rolls[0] === 1) response += " 💀 **CRITICAL FAIL!**";
        }

        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: response,
        });
    }
};
