import Docker from 'dockerode';

// dockerode reads DOCKER_HOST from env automatically when no opts are passed.
const docker = new Docker();

// Containers that /server restart should refuse to touch — they'd kill the bot
// itself, the Docker connection, or critical shared infra.
const RESTART_BLACKLIST = new Set([
    'palu-gada-bot',
    'palu-gada-root-bot',
    'palu-gada-socket-proxy',
    'mongodb',
    'traefik',
    'cloudflared',
]);

const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

const formatSeconds = (sec) => {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};

export async function getOverview() {
    const [info, df] = await Promise.all([
        docker.info(),
        docker.df(),
    ]);

    const running = info.ContainersRunning || 0;
    const stopped = (info.Containers || 0) - running;
    const images = (df.Images || []).length;

    const layersSize = (df.LayersSize || 0);
    const volumesSize = (df.Volumes || []).reduce((a, v) => a + (v.UsageData?.Size || 0), 0);
    const imagesSize = (df.Images || []).reduce((a, i) => a + (i.Size || 0), 0);

    return {
        host: info.Name,
        kernel: info.KernelVersion,
        os: info.OperatingSystem,
        cpus: info.NCPU,
        totalMem: info.MemTotal,
        running,
        stopped,
        images,
        dockerImagesSize: imagesSize,
        dockerVolumesSize: volumesSize,
        dockerLayersSize: layersSize,
    };
}

export function formatOverview(o) {
    const lines = [
        `**Host**: ${o.host}`,
        `**OS**: ${o.os} (${o.kernel})`,
        `**CPU**: ${o.cpus} cores`,
        `**Memory**: ${formatBytes(o.totalMem)}`,
        `**Containers**: ${o.running} running, ${o.stopped} stopped`,
        `**Images**: ${o.images}`,
        `**Docker storage**: ${formatBytes(o.dockerImagesSize + o.dockerVolumesSize + o.dockerLayersSize)} (images ${formatBytes(o.dockerImagesSize)} · volumes ${formatBytes(o.dockerVolumesSize)})`,
    ];
    return lines.join('\n');
}

export async function listContainers() {
    const containers = await docker.listContainers({ all: true });
    return containers
        .map((c) => ({
            name: c.Names[0]?.replace(/^\//, '') || c.Id.slice(0, 12),
            image: c.Image,
            state: c.State,
            status: c.Status,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatContainerList(containers) {
    const running = containers.filter((c) => c.state === 'running');
    const other = containers.filter((c) => c.state !== 'running');

    const rows = [];
    if (running.length) {
        rows.push('**Running**');
        for (const c of running) rows.push(`• \`${c.name}\` — ${c.status}`);
    }
    if (other.length) {
        rows.push('', '**Stopped / other**');
        for (const c of other) rows.push(`• \`${c.name}\` — ${c.state}`);
    }
    return rows.join('\n') || '(no containers)';
}

export async function getContainerStats(name) {
    const container = docker.getContainer(name);
    const [info, stats] = await Promise.all([
        container.inspect(),
        container.stats({ stream: false }),
    ]);

    // CPU calculation per Docker docs
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const sysDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuCount = stats.cpu_stats.online_cpus || 1;
    const cpuPct = sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * cpuCount * 100 : 0;

    const memUsage = stats.memory_stats.usage || 0;
    const memLimit = stats.memory_stats.limit || 1;

    return {
        name: info.Name.replace(/^\//, ''),
        state: info.State.Status,
        health: info.State.Health?.Status || 'n/a',
        started: info.State.StartedAt,
        image: info.Config.Image,
        cpuPct,
        memUsage,
        memLimit,
        memPct: (memUsage / memLimit) * 100,
    };
}

export function formatContainerStats(s) {
    const startedAt = new Date(s.started);
    const uptimeSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    return [
        `**\`${s.name}\`** (${s.state}${s.health !== 'n/a' ? `, ${s.health}` : ''})`,
        `Image: \`${s.image}\``,
        `Uptime: ${formatSeconds(uptimeSec)}`,
        `CPU: ${s.cpuPct.toFixed(1)}%`,
        `Memory: ${formatBytes(s.memUsage)} / ${formatBytes(s.memLimit)} (${s.memPct.toFixed(0)}%)`,
    ].join('\n');
}

export async function getContainerLogs(name, lines = 50) {
    const container = docker.getContainer(name);
    const buf = await container.logs({
        stdout: true,
        stderr: true,
        tail: Math.max(1, Math.min(lines, 200)),
        timestamps: false,
    });
    // Docker multiplexes stdout/stderr; strip the 8-byte header per frame when present.
    let out = '';
    let i = 0;
    while (i < buf.length) {
        if (buf[i] === 0 || buf[i] === 1 || buf[i] === 2) {
            const size = buf.readUInt32BE(i + 4);
            out += buf.slice(i + 8, i + 8 + size).toString('utf8');
            i += 8 + size;
        } else {
            out += buf.slice(i).toString('utf8');
            break;
        }
    }
    return out;
}

export async function restartContainer(name) {
    if (RESTART_BLACKLIST.has(name)) {
        throw new Error(`Refusing to restart protected container: ${name}`);
    }
    const container = docker.getContainer(name);
    await container.restart({ t: 10 });
}

export { formatBytes, formatSeconds, RESTART_BLACKLIST };
