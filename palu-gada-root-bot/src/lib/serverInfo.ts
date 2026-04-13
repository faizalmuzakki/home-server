import Docker from "dockerode";

const docker = new Docker();

const RESTART_BLACKLIST = new Set<string>([
    "palu-gada-bot",
    "palu-gada-root-bot",
    "palu-gada-socket-proxy",
    "mongodb",
    "traefik",
    "cloudflared",
]);

export function formatBytes(bytes: number): string {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatSeconds(sec: number): string {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export type Overview = {
    host: string;
    kernel: string;
    os: string;
    cpus: number;
    totalMem: number;
    running: number;
    stopped: number;
    images: number;
    dockerImagesSize: number;
    dockerVolumesSize: number;
    dockerLayersSize: number;
};

export async function getOverview(): Promise<Overview> {
    const [info, df] = await Promise.all([docker.info(), docker.df()]);
    const running = info.ContainersRunning || 0;
    const stopped = (info.Containers || 0) - running;
    const images = (df.Images || []).length;
    const layersSize = df.LayersSize || 0;
    const volumesSize = (df.Volumes || []).reduce(
        (a: number, v: any) => a + (v.UsageData?.Size || 0),
        0,
    );
    const imagesSize = (df.Images || []).reduce((a: number, i: any) => a + (i.Size || 0), 0);
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

export function formatOverview(o: Overview): string {
    return [
        `**Host**: ${o.host}`,
        `**OS**: ${o.os} (${o.kernel})`,
        `**CPU**: ${o.cpus} cores`,
        `**Memory**: ${formatBytes(o.totalMem)}`,
        `**Containers**: ${o.running} running, ${o.stopped} stopped`,
        `**Images**: ${o.images}`,
        `**Docker storage**: ${formatBytes(o.dockerImagesSize + o.dockerVolumesSize + o.dockerLayersSize)}`,
    ].join("\n");
}

export type ContainerRow = {
    name: string;
    image: string;
    state: string;
    status: string;
};

export async function listContainers(): Promise<ContainerRow[]> {
    const containers = await docker.listContainers({ all: true });
    return containers
        .map((c) => ({
            name: c.Names[0]?.replace(/^\//, "") || c.Id.slice(0, 12),
            image: c.Image,
            state: c.State,
            status: c.Status,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatContainerList(containers: ContainerRow[]): string {
    const running = containers.filter((c) => c.state === "running");
    const other = containers.filter((c) => c.state !== "running");
    const rows: string[] = [];
    if (running.length) {
        rows.push("**Running**");
        for (const c of running) rows.push(`• \`${c.name}\` — ${c.status}`);
    }
    if (other.length) {
        rows.push("", "**Stopped / other**");
        for (const c of other) rows.push(`• \`${c.name}\` — ${c.state}`);
    }
    return rows.join("\n") || "(no containers)";
}

export type ContainerStats = {
    name: string;
    state: string;
    health: string;
    started: string;
    image: string;
    cpuPct: number;
    memUsage: number;
    memLimit: number;
    memPct: number;
};

export async function getContainerStats(name: string): Promise<ContainerStats> {
    const container = docker.getContainer(name);
    const [info, stats] = await Promise.all([
        container.inspect(),
        container.stats({ stream: false }),
    ]);
    const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const sysDelta =
        (stats.cpu_stats.system_cpu_usage || 0) - (stats.precpu_stats.system_cpu_usage || 0);
    const cpuCount = stats.cpu_stats.online_cpus || 1;
    const cpuPct = sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * cpuCount * 100 : 0;
    const memUsage = stats.memory_stats.usage || 0;
    const memLimit = stats.memory_stats.limit || 1;
    return {
        name: info.Name.replace(/^\//, ""),
        state: info.State.Status,
        health: info.State.Health?.Status || "n/a",
        started: info.State.StartedAt,
        image: info.Config.Image,
        cpuPct,
        memUsage,
        memLimit,
        memPct: (memUsage / memLimit) * 100,
    };
}

export function formatContainerStats(s: ContainerStats): string {
    const startedAt = new Date(s.started);
    const uptimeSec = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    return [
        `**\`${s.name}\`** (${s.state}${s.health !== "n/a" ? `, ${s.health}` : ""})`,
        `Image: \`${s.image}\``,
        `Uptime: ${formatSeconds(uptimeSec)}`,
        `CPU: ${s.cpuPct.toFixed(1)}%`,
        `Memory: ${formatBytes(s.memUsage)} / ${formatBytes(s.memLimit)} (${s.memPct.toFixed(0)}%)`,
    ].join("\n");
}

export async function getContainerLogs(name: string, lines = 50): Promise<string> {
    const container = docker.getContainer(name);
    const buf = (await container.logs({
        stdout: true,
        stderr: true,
        tail: Math.max(1, Math.min(lines, 200)),
        timestamps: false,
        follow: false,
    })) as unknown as Buffer;
    let out = "";
    let i = 0;
    while (i < buf.length) {
        if (buf[i] === 0 || buf[i] === 1 || buf[i] === 2) {
            const size = buf.readUInt32BE(i + 4);
            out += buf.slice(i + 8, i + 8 + size).toString("utf8");
            i += 8 + size;
        } else {
            out += buf.slice(i).toString("utf8");
            break;
        }
    }
    return out;
}

export async function restartContainer(name: string): Promise<void> {
    if (RESTART_BLACKLIST.has(name)) {
        throw new Error(`Refusing to restart protected container: ${name}`);
    }
    const container = docker.getContainer(name);
    await container.restart({ t: 10 });
}
