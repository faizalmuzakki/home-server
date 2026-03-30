import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { executeCommand } from '../utils/shellExecutor.js';
import { isCommandAllowed } from '../utils/validation.js';

// Unicode block characters for visual bar
function makeBar(pct, width = 12) {
    const filled = Math.round(Math.max(0, Math.min(100, pct)) / 100 * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function barColor(pct) {
    if (pct >= 90) return 0xED4245; // red
    if (pct >= 75) return 0xFEE75C; // yellow
    return 0x57F287;                 // green
}

/**
 * Parse `df -h` output into structured rows.
 * Handles both BusyBox (Alpine) and GNU coreutils formats.
 */
function parseDf(raw) {
    const lines = raw.trim().split('\n');
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        // Normalize whitespace
        const parts = lines[i].trim().split(/\s+/);

        // Skip line continuations (filesystem wraps to next line with only 5 fields)
        if (parts.length < 5) continue;

        // df -h columns: Filesystem Size Used Avail Use% Mounted
        // BusyBox: Filesystem  1K-blocks  Used  Available  Use%  Mounted
        const pctStr = parts[parts.length - 2];
        const mount = parts[parts.length - 1];
        const pct = parseInt(pctStr, 10);

        if (isNaN(pct)) continue;

        // Skip irrelevant pseudo-filesystems
        if (['tmpfs', 'devtmpfs', 'shm', 'overlay', 'proc', 'sysfs', 'cgroup', 'nsfs'].includes(parts[0])) {
            // Only keep overlay if it's the main fs at /
            if (parts[0] !== 'overlay' || mount !== '/') continue;
        }

        const size = parts[parts.length - 4];
        const used = parts[parts.length - 3];
        const avail = parts[parts.length - 2 - 1]; // Avail comes before Use%

        rows.push({ fs: parts[0], size, used, avail, pct, mount });
    }

    return rows;
}

/**
 * Parse `du -sh` output into [{size, path}] sorted by the raw output order.
 */
function parseDu(raw) {
    return raw.trim().split('\n')
        .filter(l => l.includes('\t') || l.match(/^\S+\s+\S/))
        .map(l => {
            const parts = l.trim().split(/\t|\s{2,}/);
            return { size: parts[0], path: parts.slice(1).join(' ').replace('/host-repo/', '') };
        })
        .filter(r => r.size && r.path);
}

export default {
    data: new SlashCommandBuilder()
        .setName('storage')
        .setDescription('Check server disk usage and directory sizes (admin only)')
        .addSubcommand(sub =>
            sub.setName('all')
                .setDescription('Show disk usage + top directories (default view)')
        )
        .addSubcommand(sub =>
            sub.setName('disk')
                .setDescription('Show raw disk usage for all filesystems (df -h)')
        )
        .addSubcommand(sub =>
            sub.setName('dirs')
                .setDescription('Show top directories by size inside the home-server repo')
                .addIntegerOption(opt =>
                    opt.setName('depth')
                        .setDescription('Subdirectory depth to scan (default: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(3)
                )
        ),

    async execute(interaction) {
        const validation = isCommandAllowed(interaction, 'ALLOWED_DEPLOY_USERS', null);
        if (!validation.allowed) {
            return interaction.reply({ content: validation.reason, flags: MessageFlags.Ephemeral });
        }

        const sub = interaction.options.getSubcommand();
        await interaction.deferReply();

        try {
            if (sub === 'disk') {
                await handleDisk(interaction);
            } else if (sub === 'dirs') {
                const depth = interaction.options.getInteger('depth') ?? 1;
                await handleDirs(interaction, depth);
            } else {
                await handleAll(interaction);
            }
        } catch (error) {
            await logCommandError(interaction, error, 'storage');
            await interaction.editReply({ content: 'Failed to retrieve storage info.' });
        }
    },
};

async function handleDisk(interaction) {
    const { stdout, exitCode } = await executeCommand('df -h', { cwd: '/', timeout: 10_000 });

    if (exitCode !== 0 || !stdout.trim()) {
        return interaction.editReply({ content: '❌ Failed to run `df -h`.' });
    }

    const rows = parseDf(stdout);

    if (!rows.length) {
        return interaction.editReply({
            content: `No filesystems found. Raw output:\n\`\`\`\n${stdout.slice(0, 1800)}\n\`\`\``,
        });
    }

    const worstPct = Math.max(...rows.map(r => r.pct));
    const fields = rows.map(r => ({
        name: `\`${r.mount}\`  ${r.fs}`,
        value: `\`[${makeBar(r.pct)}] ${r.pct}%\`  ${r.used} used / ${r.size}  ·  ${r.avail} free`,
        inline: false,
    }));

    await interaction.editReply({
        embeds: [{
            color: barColor(worstPct),
            title: '💾 Disk Usage',
            fields,
            footer: { text: 'df -h inside bot container' },
            timestamp: new Date().toISOString(),
        }],
    });
}

async function handleDirs(interaction, depth) {
    const pattern = depth === 1 ? '/host-repo/*' : depth === 2 ? '/host-repo/*/*' : '/host-repo/*/*/*';
    const { stdout, exitCode } = await executeCommand(
        `du -sh ${pattern} 2>/dev/null | sort -rh | head -20`,
        { cwd: '/', timeout: 30_000 }
    );

    if (exitCode !== 0 && !stdout.trim()) {
        return interaction.editReply({ content: '❌ Failed to run `du`.' });
    }

    const rows = parseDu(stdout);
    if (!rows.length) {
        return interaction.editReply({ content: 'No directories found at `/host-repo`.' });
    }

    const lines = rows.map(r => `\`${r.size.padStart(7)}\`  ${r.path}`).join('\n');

    await interaction.editReply({
        embeds: [{
            color: 0x5865F2,
            title: `📁 Home-Server Directory Sizes (depth ${depth})`,
            description: lines.slice(0, 4000),
            footer: { text: 'du -sh /host-repo  ·  sorted largest first' },
            timestamp: new Date().toISOString(),
        }],
    });
}

async function handleAll(interaction) {
    // Run both commands in parallel
    const [dfResult, duResult] = await Promise.all([
        executeCommand('df -h', { cwd: '/', timeout: 10_000 }),
        executeCommand('du -sh /host-repo/*/ 2>/dev/null | sort -rh | head -10', { cwd: '/', timeout: 30_000 }),
    ]);

    const dfRows = parseDf(dfResult.stdout);
    const duRows = parseDu(duResult.stdout);

    const worstPct = dfRows.length ? Math.max(...dfRows.map(r => r.pct)) : 0;
    const fields = [];

    // Disk usage section
    if (dfRows.length) {
        fields.push(...dfRows.map(r => ({
            name: `\`${r.mount}\`  ${r.fs}`,
            value: `\`[${makeBar(r.pct)}] ${r.pct}%\`  ${r.used} / ${r.size}  ·  ${r.avail} free`,
            inline: false,
        })));
    } else {
        fields.push({ name: '⚠️ Disk Info', value: 'Could not parse df output', inline: false });
    }

    // Separator + directory sizes
    if (duRows.length) {
        const dirLines = duRows.map(r => `\`${r.size.padStart(7)}\`  ${r.path}`).join('\n');
        fields.push({
            name: '📁 Largest dirs in home-server repo',
            value: dirLines.slice(0, 1024),
            inline: false,
        });
    }

    // Alert if any filesystem is ≥ 90%
    const critical = dfRows.filter(r => r.pct >= 90);
    let description;
    if (critical.length) {
        description = `⚠️ **Critical:** ${critical.map(r => `\`${r.mount}\` at **${r.pct}%**`).join(', ')}`;
    }

    await interaction.editReply({
        embeds: [{
            color: barColor(worstPct),
            title: '💾 Storage Overview',
            description,
            fields,
            footer: { text: 'df -h  ·  du -sh /host-repo' },
            timestamp: new Date().toISOString(),
        }],
    });
}
