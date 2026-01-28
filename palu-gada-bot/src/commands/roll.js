import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Roll dice')
        .addStringOption(option =>
            option
                .setName('dice')
                .setDescription('Dice notation (e.g., 2d6, d20, 3d8+5) - default: d20')
                .setRequired(false)
        ),

    async execute(interaction) {
        const diceInput = interaction.options.getString('dice') || 'd20';

        // Parse dice notation: XdY+Z or XdY-Z or dY
        const diceRegex = /^(\d*)d(\d+)([+-]\d+)?$/i;
        const match = diceInput.toLowerCase().replace(/\s/g, '').match(diceRegex);

        if (!match) {
            return interaction.reply({
                content: 'Invalid dice notation! Use format like `d20`, `2d6`, `3d8+5`, or `4d10-2`',
                flags: MessageFlags.Ephemeral,
            });
        }

        const numDice = parseInt(match[1]) || 1;
        const diceSides = parseInt(match[2]);
        const modifier = parseInt(match[3]) || 0;

        // Validation
        if (numDice < 1 || numDice > 100) {
            return interaction.reply({
                content: 'Number of dice must be between 1 and 100.',
                flags: MessageFlags.Ephemeral,
            });
        }

        if (diceSides < 2 || diceSides > 1000) {
            return interaction.reply({
                content: 'Dice sides must be between 2 and 1000.',
                flags: MessageFlags.Ephemeral,
            });
        }

        // Roll the dice
        const rolls = [];
        for (let i = 0; i < numDice; i++) {
            rolls.push(Math.floor(Math.random() * diceSides) + 1);
        }

        const sum = rolls.reduce((a, b) => a + b, 0);
        const total = sum + modifier;

        // Determine if it's a critical (for d20)
        let criticalType = null;
        if (numDice === 1 && diceSides === 20) {
            if (rolls[0] === 20) criticalType = 'success';
            else if (rolls[0] === 1) criticalType = 'fail';
        }

        // Build response
        const embed = {
            color: criticalType === 'success' ? 0x57F287 : criticalType === 'fail' ? 0xED4245 : 0x5865F2,
            title: `🎲 ${diceInput.toUpperCase()}`,
            fields: [],
            footer: {
                text: `Rolled by ${interaction.user.tag}`,
            },
            timestamp: new Date().toISOString(),
        };

        // Show individual rolls if more than 1 die
        if (numDice > 1) {
            const rollsDisplay = rolls.length <= 20
                ? rolls.map((r, i) => {
                    // Highlight max and min rolls
                    if (r === diceSides) return `**${r}**`;
                    if (r === 1) return `*${r}*`;
                    return r.toString();
                }).join(', ')
                : `${rolls.slice(0, 20).join(', ')}... (${rolls.length - 20} more)`;

            embed.fields.push({
                name: `Rolls (${numDice}d${diceSides})`,
                value: `[ ${rollsDisplay} ]`,
                inline: false,
            });

            embed.fields.push({
                name: 'Sum',
                value: sum.toString(),
                inline: true,
            });

            // Stats
            embed.fields.push({
                name: 'Min',
                value: Math.min(...rolls).toString(),
                inline: true,
            });
            embed.fields.push({
                name: 'Max',
                value: Math.max(...rolls).toString(),
                inline: true,
            });
        }

        // Show modifier if present
        if (modifier !== 0) {
            const modifierStr = modifier > 0 ? `+${modifier}` : modifier.toString();
            embed.fields.push({
                name: 'Modifier',
                value: modifierStr,
                inline: true,
            });
        }

        // Show total
        let totalDisplay = `## ${total}`;
        if (criticalType === 'success') {
            totalDisplay = `## ${total} 🎉\n**NATURAL 20! CRITICAL SUCCESS!**`;
        } else if (criticalType === 'fail') {
            totalDisplay = `## ${total} 💀\n**NATURAL 1! CRITICAL FAIL!**`;
        }

        embed.description = totalDisplay;

        await interaction.reply({ embeds: [embed] });
    },
};
