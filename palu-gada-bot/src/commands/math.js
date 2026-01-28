import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

// Safe math expression evaluator
function evaluateExpression(expr) {
    // Sanitize input - only allow safe characters
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
        .replace(/max\(/gi, 'Math.max(')
        .replace(/random\(\)/gi, 'Math.random()');

    // Validate - only allow safe characters
    if (!/^[0-9+\-*/().,%Math\s]+$/.test(sanitized.replace(/Math\.(sqrt|abs|sin|cos|tan|log10|log|floor|ceil|round|pow|min|max|random|PI|E)/g, ''))) {
        throw new Error('Invalid characters in expression');
    }

    // Additional security: check for dangerous patterns
    if (sanitized.includes('constructor') ||
        sanitized.includes('prototype') ||
        sanitized.includes('__') ||
        sanitized.includes('eval') ||
        sanitized.includes('function')) {
        throw new Error('Invalid expression');
    }

    // Evaluate using Function (safer than eval for math)
    try {
        const fn = new Function(`"use strict"; return (${sanitized})`);
        const result = fn();

        if (typeof result !== 'number' || !isFinite(result)) {
            if (isNaN(result)) throw new Error('Result is not a number');
            if (!isFinite(result)) throw new Error('Result is infinity');
        }

        return result;
    } catch (e) {
        throw new Error('Invalid expression');
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('math')
        .setDescription('Calculate a mathematical expression')
        .addStringOption(option =>
            option
                .setName('expression')
                .setDescription('The math expression to calculate')
                .setRequired(true)
        ),

    async execute(interaction) {
        const expression = interaction.options.getString('expression');

        try {
            const result = evaluateExpression(expression);

            // Format result
            let formattedResult;
            if (Number.isInteger(result)) {
                formattedResult = result.toLocaleString();
            } else {
                // Round to 10 decimal places to avoid floating point errors
                formattedResult = parseFloat(result.toPrecision(10)).toString();
            }

            const embed = {
                color: 0x5865F2,
                title: '🔢 Calculator',
                fields: [
                    {
                        name: 'Expression',
                        value: `\`${expression}\``,
                        inline: false,
                    },
                    {
                        name: 'Result',
                        value: `**${formattedResult}**`,
                        inline: false,
                    },
                ],
                footer: {
                    text: 'Supports: +, -, *, /, ^, sqrt, sin, cos, tan, log, ln, pi, e',
                },
            };

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            await logCommandError(interaction, error, 'math');

            await interaction.reply({
                embeds: [{
                    color: 0xED4245,
                    title: '❌ Calculation Error',
                    description: `Could not evaluate: \`${expression}\`\n\n**Error:** ${error.message}`,
                    footer: {
                        text: 'Tip: Use standard notation like 2+2, sqrt(16), sin(3.14)',
                    },
                }],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
