# Infrastructure Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive the dead palu-gada-root-bot and cut claude-api container RAM from 1G to 384M — no behavior changes, just resource recovery.

**Architecture:** Two independent cleanup tasks. Root bot gets its compose services commented out and its TODO/README updated. Claude-api gets tuned env vars and a tighter resource limit — still using the CLI, just configured to use less memory per invocation.

**Tech Stack:** Docker Compose, shell

## Global Constraints

- No behavior changes to any running service
- All changes must be deployable via the existing `git push → webhook → deploy.sh` pipeline
- Don't delete code — comment out / archive so it's recoverable from git history
- Repo root: `~/Projects/home-server`

---

### Task 1: Archive palu-gada-root-bot

**Files:**
- Modify: `palu-gada-root-bot/docker-compose.yml`
- Modify: `README.md` (lines 106, 189)
- Modify: `TODO.md` (lines 34–40, 53)

**Interfaces:**
- Consumes: nothing
- Produces: freed 512M RAM reservation, cleaner docs

- [ ] **Step 1: Verify root bot is already stopped**

```bash
cd ~/Projects/home-server
docker ps -a --filter "name=palu-gada-root-bot" --format "{{.Names}} {{.Status}}"
```

Expected: either no output or `Exited` status. If it's somehow running:
```bash
cd palu-gada-root-bot && docker compose down && cd ..
```

- [ ] **Step 2: Comment out all services in root bot docker-compose.yml**

In `palu-gada-root-bot/docker-compose.yml`, replace the entire file with:

```yaml
# =============================================================================
# ARCHIVED — Root platform is defunct (DEV_TOKEN unauthorized since 2026-04-14).
# See TODO.md for context. Uncomment and supply a valid DEV_TOKEN to revive.
# =============================================================================
#
# services:
#   palu-gada-root-bot:
#     build: .
#     container_name: palu-gada-root-bot
#     restart: unless-stopped
#     env_file:
#       - .env
#     environment:
#       - NODE_ENV=production
#       - DOCKER_HOST=tcp://palu-gada-socket-proxy:2375
#     security_opt:
#       - no-new-privileges:true
#     cap_drop:
#       - ALL
#     ports:
#       - "127.0.0.1:3051:3051"
#     networks:
#       - traefik-public
#       - socket-proxy
#     volumes:
#       - bot-data:/app/data
#     labels:
#       - "traefik.enable=true"
#       - "autoheal=true"
#       - "traefik.http.routers.root-bot-health.rule=Host(`root-bot.${DOMAIN}`) && Path(`/health`)"
#       - "traefik.http.routers.root-bot-health.entrypoints=websecure"
#       - "traefik.http.routers.root-bot-health.tls.certresolver=cloudflare"
#       - "traefik.http.routers.root-bot-health.middlewares=lan-only@file"
#       - "traefik.http.services.root-bot-health.loadbalancer.server.port=3051"
#     healthcheck:
#       test: ["CMD-SHELL", "node -e 'require(\"http\").get(\"http://localhost:3051/health\", (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on(\"error\", () => process.exit(1))'"]
#       interval: 30s
#       timeout: 10s
#       retries: 3
#       start_period: 30s
#     deploy:
#       resources:
#         limits:
#           cpus: '0.5'
#           memory: 512M
#         reservations:
#           cpus: '0.1'
#           memory: 128M
#
# networks:
#   traefik-public:
#     external: true
#   socket-proxy:
#     name: palu-gada-socket-proxy
#     external: true
#
# volumes:
#   bot-data:
```

- [ ] **Step 3: Update README.md — mark root bot as archived**

In `README.md`, change the palu-gada-root-bot row in the Applications table (line 106):

From:
```markdown
| [Palu Gada Root Bot](./palu-gada-root-bot/) | 3051 | Discord bot (root server) | `palu-gada-root-bot/` |
```

To:
```markdown
| ~~[Palu Gada Root Bot](./palu-gada-root-bot/)~~ | 3051 | ~~Discord bot (Root platform)~~ — **Archived** (Root API defunct) | `palu-gada-root-bot/` |
```

In the Current Status table (line 189), if `palu-gada-root-bot` appears in the Applications row's Containers column, remove it.

- [ ] **Step 4: Update TODO.md — move root bot item from Open to Done**

In `TODO.md`, remove the "palu-gada-root-bot — DEV_TOKEN unauthorized" section from `## Open` (lines 34–40).

Add to `## Recently done`:
```markdown
- 2026-07-30 — Archived palu-gada-root-bot: commented out docker-compose services. Root platform API is defunct since 2026-04-14 (DEV_TOKEN unauthorized). Code remains in git.
```

Also update the "Bot consolidation" idea (line 53) since the root bot is now archived:
```markdown
### Bot consolidation (parked — root bot archived)
`palu-gada-root-bot` is archived (Root platform defunct since Apr 2026). If Root revives, evaluate whether to consolidate or maintain separate codebases.
```

- [ ] **Step 5: Verify deploy script won't break**

With the compose commented out, `deploy.sh` will detect changes in `palu-gada-root-bot/` and attempt `docker compose up -d` which should be a no-op (no services defined). Verify:

```bash
cd ~/Projects/home-server/palu-gada-root-bot
docker compose config --services 2>&1
```

Expected: empty output or a warning (no services). This confirms `docker compose up -d` will succeed silently.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/home-server
git add palu-gada-root-bot/docker-compose.yml README.md TODO.md
git commit -m "chore: archive palu-gada-root-bot — Root platform defunct

Root API returns 401 on DEV_TOKEN since 2026-04-14. Container was already
stopped. Commented out compose services, updated docs. Code preserved in git."
```

---

### Task 2: Reduce claude-api RAM from 1G to 384M

**Files:**
- Modify: `claude-api/docker-compose.yml`
- Modify: `claude-api/.env.example`
- Modify: `claude-api/.env`
- Modify: `claude-api/Dockerfile` (line 18)
- Delete: `claude-api/prompt.js` (dead file — route logic is in `src/routes/prompt.js`)

**Interfaces:**
- Consumes: nothing
- Produces: ~616M freed RAM headroom

**Context:** The Claude Code CLI spawns a full Node/V8 process per request (~150–250MB RSS each). Three concurrent requests at peak ≈ 750MB + Express overhead. By limiting concurrency to 1, capping V8 heap, and reducing turns, peak RAM drops to ~300MB. All current callers (palu-gada-bot AI commands, expense-tracker parse) do single-turn Q&A — nobody uses multi-turn or high concurrency.

- [ ] **Step 1: Verify current claude-api resource usage**

```bash
docker stats claude-api --no-stream --format "{{.MemUsage}} / {{.MemPerc}}"
```

Note the current usage for comparison after changes.

- [ ] **Step 2: Update docker-compose.yml with tighter limits**

In `claude-api/docker-compose.yml`, make these changes (4 edits in the same file):

1. Change `tmpfs` size `200m` → `50m`:
```yaml
    tmpfs:
      - /tmp:noexec,nosuid,size=50m
```

2. Add `NODE_OPTIONS` to environment block (after `ANTHROPIC_API_KEY` line):
```yaml
      - NODE_OPTIONS=--max-old-space-size=256
```

3. Change default `MAX_TURNS` from `10` to `1`:
```yaml
      - MAX_TURNS=${MAX_TURNS:-1}
```

4. Change default `MAX_CONCURRENT` from `3` to `1`:
```yaml
      - MAX_CONCURRENT=${MAX_CONCURRENT:-1}
```

5. Lower resource limits — CPU `2.0` → `1.0`, memory `1G` → `384M`, reservations accordingly:
```yaml
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 384M
        reservations:
          cpus: '0.25'
          memory: 128M
```

- [ ] **Step 3: Update Dockerfile — skip npm wrapper**

In `claude-api/Dockerfile`, change line 18:

From:
```dockerfile
CMD ["npm", "start"]
```

To:
```dockerfile
CMD ["node", "src/index.js"]
```

This eliminates the npm parent process (~20MB overhead).

- [ ] **Step 4: Update .env.example and .env with new defaults**

Add or update in `claude-api/.env.example`:
```env
MAX_TURNS=1
MAX_CONCURRENT=1
```

Apply the same values to `claude-api/.env` (the live config).

- [ ] **Step 5: Remove dead prompt.js at project root**

`claude-api/prompt.js` (7285 bytes) is a leftover — the real route lives at `claude-api/src/routes/prompt.js`. Delete it:

```bash
rm claude-api/prompt.js
```

Verify the real route still exists:
```bash
ls claude-api/src/routes/prompt.js
```

- [ ] **Step 6: Rebuild and verify**

```bash
cd ~/Projects/home-server/claude-api
docker compose up -d --build --force-recreate
```

Wait 15 seconds for healthcheck, then:

```bash
# Health check
curl -s http://localhost:3100/health | head

# Check RAM usage
docker stats claude-api --no-stream --format "{{.MemUsage}} / {{.MemPerc}}"

# Functional test — active sessions endpoint
curl -s http://localhost:3100/api/prompt/active
```

Expected: healthy, RAM well under 384M at idle, `{"active":0,"max":1}`.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/home-server
git add claude-api/docker-compose.yml claude-api/Dockerfile claude-api/.env.example
git rm claude-api/prompt.js
git commit -m "perf: reduce claude-api RAM 1G→384M

- MAX_CONCURRENT 3→1 (biggest save: one CLI process at a time)
- MAX_TURNS 10→1 (callers only do single-turn Q&A)
- NODE_OPTIONS --max-old-space-size=256 (cap V8 heap)
- tmpfs 200m→50m, CPU 2.0→1.0
- Skip npm wrapper in CMD
- Remove dead root-level prompt.js (route lives in src/routes/)"
```
