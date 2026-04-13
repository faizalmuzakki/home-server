import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { isCommandAllowed } from '../utils/validation.js';
import {
    getOverview,
    formatOverview,
    listContainers,
    formatContainerList,
    getContainerStats,
    formatContainerStats,
    getContainerLogs,
    restartContainer,
} from '../utils/serverInfo.js';

const MAX_MSG = 1900;

const truncate = (text) => (text.length > MAX_MSG ? text.slice(0, MAX_MSG) + '\n…(truncated)' : text);

export default {
    data: new SlashCommandBuilder()
        .setName('server')
        .setDescription('Home server admin — status, containers, logs, restart')
        .addSubcommand((sc) =>
            sc.setName('status').setDescription('Host overview: OS, memory, containers, Docker storage')
        )
        .addSubcommand((sc) =>
            sc.setName('containers').setDescription('List all containers and their states')
        )
        .addSubcommand((sc) =>
            sc
                .setName('stats')
                .setDescription('CPU/memory/uptime for a specific container')
                .addStringOption((o) => o.setName('name').setDescription('Container name').setRequired(true))
        )
        .addSubcommand((sc) =>
            sc
                .setName('logs')
                .setDescription('Last N lines of a container log')
                .addStringOption((o) => o.setName('name').setDescription('Container name').setRequired(true))
                .addIntegerOption((o) =>
                    o.setName('lines').setDescription('Lines to show (default 50, max 200)').setMinValue(1).setMaxValue(200)
                )
        )
        .addSubcommand((sc) =>
            sc
                .setName('restart')
                .setDescription('Restart a container (protected infra blocked)')
                .addStringOption((o) => o.setName('name').setDescription('Container name').setRequired(true))
        ),

    async execute(interaction) {
        const validation = isCommandAllowed(interaction, 'ALLOWED_DEPLOY_USERS', 'DEPLOY_CHANNEL_ID');
        if (!validation.allowed) {
            return interaction.reply({ content: validation.reason, flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'status') {
                const overview = await getOverview();
                const body = formatOverview(overview);
                return interaction.editReply({
                    embeds: [{ color: 0x57f287, title: '🖥️ Server status', description: body, timestamp: new Date().toISOString() }],
                });
            }

            if (sub === 'containers') {
                const containers = await listContainers();
                return interaction.editReply({
                    embeds: [{
                        color: 0x5865f2,
                        title: `📦 Containers (${containers.length})`,
                        description: truncate(formatContainerList(containers)),
                    }],
                });
            }

            if (sub === 'stats') {
                const name = interaction.options.getString('name');
                const stats = await getContainerStats(name);
                return interaction.editReply({
                    embeds: [{ color: 0xfee75c, title: `📊 ${name}`, description: formatContainerStats(stats) }],
                });
            }

            if (sub === 'logs') {
                const name = interaction.options.getString('name');
                const lines = interaction.options.getInteger('lines') || 50;
                const logs = await getContainerLogs(name, lines);
                const body = logs.trim() || '(no output)';
                return interaction.editReply({
                    content: `**Logs — \`${name}\`** (last ${lines} lines)\n\`\`\`\n${truncate(body)}\n\`\`\``,
                });
            }

            if (sub === 'restart') {
                const name = interaction.options.getString('name');
                await restartContainer(name);
                return interaction.editReply({
                    embeds: [{ color: 0x57f287, title: '♻️ Restart triggered', description: `\`${name}\` restart requested.` }],
                });
            }

            return interaction.editReply('Unknown subcommand.');
        } catch (error) {
            console.error('/server error:', error);
            const msg = error?.message || String(error);
            return interaction.editReply({
                content: `❌ \`${sub}\` failed: ${msg.slice(0, 500)}`,
            });
        }
    },
};
