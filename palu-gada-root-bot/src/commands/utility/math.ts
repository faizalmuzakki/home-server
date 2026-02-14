import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

function evaluateExpression(expr: string): number {
    const sanitized = expr
        .replace(/\s+/g, '')
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/\^/g, '**')
        .replace(/π|pi/gi, Math.PI.toString())
        .replace(/e(?![0-9])/gi, Math.E.toString())
        .replace(/sqrt\(/gi, 'Math.sqrt(')
        .replace(/abs\(/gi, 'Math.abs(')
        .replace(/sin\(/gi, 'Math.sin(')
        .replace(/cos\(/gi, 'Math.cos(')
        .replace(/tan\(/gi, 'Math.tan(')
        .replace(/log\(/gi, 'Math.log10(')
        .replace(/ln\(/gi, 'Math.log(')
        .replace(/floor\(/gi, 'Math.floor(')
        .replace(/ceil\(/gi, 'Math.ceil(')
        .replace(/round\(/gi, 'Math.round(')
        .replace(/pow\(/gi, 'Math.pow(')
        .replace(/min\(/gi, 'Math.min(')
        .replace(/max\(/gi, 'Math.max(');

    if (!/^[0-9+\-*/().,%Math\s]+$/.test(sanitized.replace(/Math\.(sqrt|abs|sin|cos|tan|log10|log|floor|ceil|round|pow|min|max|PI|E)/g, ''))) {
        throw new Error('Invalid characters in expression');
    }

    try {
        const fn = new Function(`"use strict"; return (${sanitized})`);
        const result = fn();
        if (typeof result !== 'number' || !isFinite(result)) {
            throw new Error('Invalid result');
        }
        return result;
    } catch (e) {
        throw new Error('Invalid expression');
    }
}

export const mathCommand: Command = {
    name: "math",
    description: "Calculate a mathematical expression",
    usage: "/math <expression>",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const expression = args.join(" ");

        if (!expression) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: /math <expression>",
            });
            return;
        }

        try {
            const result = evaluateExpression(expression);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `🔢 **Expression:** \`${expression}\`\n✅ **Result:** ${result.toLocaleString(undefined, { maximumFractionDigits: 10 })}`,
            });
        } catch (error: any) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `❌ **Error:** ${error.message}`,
            });
        }
    }
};
