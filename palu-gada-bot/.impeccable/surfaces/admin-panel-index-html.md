---
version: 1
slug: "admin-panel-index-html"
primary_target: "admin-panel/index.html"
related_targets: ["admin-panel/styles.css","admin-panel/app.js"]
---

## Scope

The admin panel at palu-gada-admin.solork.dev: `admin-panel/index.html`,
`styles.css`, `app.js`. Visitor mode: Operate. Audience: the bot's owner, alone,
in short task-shaped sessions, usually right after a deploy.

## Direction contract

THESIS: An operations console for one operator, where health over time leads and
configuration follows. It refuses the bot-dashboard arrangement it replaces:
four decorative stat cards over a gradient, with nothing that says whether the
thing was up an hour ago. The user chose the category standard as the world and
Grafana / Uptime Kuma as the craft bar; both are honoured literally, no irony.

OWN-WORLD: Near-black instrument ground (#111217 page, #181b1f panels, #22252b
hairlines), recognisable with all content removed by its titled panel frames:
every figure lives inside a named frame with a 1px border and a 3px radius, never
a floating card. Ink is #ccccdc, secondary #7b7f8b. Semantic colour only:
#73bf69 up, #f2495c down, #ff9830 attention, and Discord blurple #5865f2 reserved
for the one primary action per view. Data and measurement set in a mono face,
prose in a sans. Drawn SVG icons at one stroke weight replace the emoji nav.

STORY: The owner opens it after a merge, reads the heartbeat bar and knows in one
glance whether the redeploy landed, then flips a command toggle or the AI cost
switch and leaves.

FIRST VIEWPORT: Sidebar left with drawn icons. Top row, two panels: "Uptime"
carrying the live process uptime at instrument scale, and "Heartbeat
· /api/health" carrying the last 40 samples as a bar row, red where a check
missed, with average websocket latency beneath. Below, a "Guilds" panel and a
"Commands" panel whose rows carry the enabled tag and are the toggle surface. No
figure appears without its panel title.

FORM: The canon card, the standing exit, taken deliberately over four dealt
directions; craft bar Grafana / Uptime Kuma; seed key eb5d739f.

FINISH: unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.

## Constraints

Three static files, no build step, no framework, no runtime CDN. Every page,
route and control survives: Overview, Servers, Leaderboard, Allowlist, Global
Commands, the AI cost toggle. Real data only; the heartbeat series comes from a
new in-process sampler and is labelled as covering the time since the last
restart.
