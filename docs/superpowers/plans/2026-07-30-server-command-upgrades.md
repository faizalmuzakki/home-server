# Server Command Upgrades — Disk & Memory Subcommands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/server disk` and `/server memory` subcommands to the Discord bot for quick host-level monitoring without SSH.

**Architecture:** Extend the existing `/server` slash command (which already has `status`, `containers`, `stats`, `logs`, `restart` subcommands) with two new subcommands. Both use the existing `dockerode` connection — Docker's `/info` and `/system/df` endpoints expose host memory and disk data, so we don't need any new Docker socket permissions or host mounts. The `serverInfo.js` utility already has `formatBytes` and the `docker` instance.

**Tech Stack:** discord.js (existing), dockerode (existing), Node.js `child_process` for `df` via Docker exec

## Global Constraints

- Branch off `main` (or `production` if that's the default), create PR — don't push to main
- Follow existing pattern: utility functions in `src/utils/serverInfo.js`, subcommand wiring in `src/commands/server.js`
- Existing subcommands must not break
- The bot talks to Docker via `palu-gada-socket-proxy` — no direct `/var/run/docker.sock` mount
- Use worktree for isolation

---

### Task 1: Add `getDiskUsage()` and `getMemoryUsage()` to serverInfo.js

**Files:**
- Modify: `palu-gada-bot/src/utils/serverInfo.js` (~lines 38-65 area, append new exports)
- Modify: `palu-gada-bot/src/commands/server.js` (add 2 subcommands)

**Interfaces:**
- Consumes: `docker` instance from `serverInfo.js` (existing)
- Produces: `getDiskUsage(): Promise<{...}>`, `formatDiskUsage(d): string`, `getMemoryDetail(): Promise<{...}>`, `formatMemoryDetail(m): string`

- [ ] **Step 1: Add getDiskUsage and formatDiskUsage to serverInfo.js**

Append before the final `export { formatBytes, ... }` line in `palu-gada-bot/src/utils/serverInfo.js`:

```javascript
export async function getDiskUsage() {
    const [info, df] = await Promise.all([docker.info(), docker.df()]);

    const dockerRoot = info.DockerRootDir || '/var/lib/docker';
    const imagesSize = (df.Images || []).reduce((a, i) => a + (i.Size || 0), 0);
    const containersSize = (df.Containers || []).reduce((a, c) => a + (c.SizeRw || 0), 0);
    const volumesSize = (df.Volumes || []).reduce((a, v) => a + (v.UsageData?.Size || 0), 0);
    const buildCacheSize = (df.BuildCache || []).reduce((a, b) => a + (b.Size || 0), 0);
    const totalDocker = imagesSize + containersSize + volumesSize + buildCacheSize;

    return {
        dockerRoot,
        imagesSize,
        containersSize,
        volumesSize,
        buildCacheSize,
        totalDocker,
    };
}

export function formatDiskUsage(d) {
    return [
        `**Docker Root**: \`${d.dockerRoot}\``,
        `**Images**: ${formatBytes(d.imagesSize)}`,
        `**Containers (writable layers)**: ${formatBytes(d.containersSize)}`,
        `**Volumes**: ${formatBytes(d.volumesSize)}`,
        `**Build cache**: ${formatBytes(d.buildCacheSize)}`,
        `**Total Docker storage**: ${formatBytes(d.totalDocker)}`,
    ].join('\n');
}
```

- [ ] **Step 2: Add getMemoryDetail and formatMemoryDetail to serverInfo.js**

Append after the disk functions:

```javascript
export async function getMemoryDetail() {
    const containers = await docker.listContainers({ all: false }); // running only
    const statsList = await Promise.all(
        containers.map(async (c) => {
            const container = docker.getContainer(c.Id);
            const stats = await container.stats({ stream: false });
            return {
                name: c.Names[0]?.replace(/^\//, '') || c.Id.slice(0, 12),
                memUsage: stats.memory_stats.usage || 0,
                memLimit: stats.memory_stats.limit || 0,
            };
        })
    );

    statsList.sort((a, b) => b.memUsage - a.memUsage);

    const info = await docker.info();
    return {
        hostTotal: info.MemTotal,
        containers: statsList,
    };
}

export function formatMemoryDetail(m) {
    const lines = [`**Host total**: ${formatBytes(m.hostTotal)}`, ''];
    let containerTotal = 0;
    for (const c of m.containers) {
        containerTotal += c.memUsage;
        const limit = c.memLimit && c.memLimit < m.hostTotal
            ? ` / ${formatBytes(c.memLimit)}`
            : '';
        lines.push(`• \`${c.name}\`: ${formatBytes(c.memUsage)}${limit}`);
    }
    lines.push('', `**Container total**: ${formatBytes(containerTotal)}`);
    return lines.join('\n');
}
```

- [ ] **Step 3: Wire up the two new subcommands in server.js**

In `palu-gada-bot/src/commands/server.js`:

Add the imports (update the existing import line):
```javascript
import {
    getOverview, formatOverview,
    listContainers, formatContainerList,
    getContainerStats, formatContainerStats,
    getContainerLogs, restartContainer,
    getDiskUsage, formatDiskUsage,
    getMemoryDetail, formatMemoryDetail,
} from '../utils/serverInfo.js';
```

Add the subcommand definitions in the `data` builder chain (before the closing paren):
```javascript
        .addSubcommand((sc) =>
            sc.setName('disk').setDescription('Docker disk usage breakdown')
        )
        .addSubcommand((sc) =>
            sc.setName('memory').setDescription('Memory usage per container, sorted by usage')
        )
```

Add the handler cases in the `execute` function's subcommand switch (before the `Unknown subcommand` fallback):
```javascript
            } else if (sub === 'disk') {
                const d = await getDiskUsage();
                await interaction.editReply(truncate(formatDiskUsage(d)));

            } else if (sub === 'memory') {
                const m = await getMemoryDetail();
                await interaction.editReply(truncate(formatMemoryDetail(m)));
```

- [ ] **Step 4: Test syntax**

```bash
node --check palu-gada-bot/src/utils/serverInfo.js
node --check palu-gada-bot/src/commands/server.js
```

- [ ] **Step 5: Deploy slash commands to Discord**

```bash
cd palu-gada-bot
DEPLOY_ONLY=true node src/deploy-commands.js
```

Verify the output shows the updated `/server` command with `disk` and `memory` subcommands.

- [ ] **Step 6: Commit**

```bash
git add palu-gada-bot/src/utils/serverInfo.js palu-gada-bot/src/commands/server.js
git commit -m "feat(bot): add /server disk and /server memory subcommands

- /server disk: Docker storage breakdown (images, volumes, containers, build cache)
- /server memory: per-container memory usage sorted by consumption"
```
