# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase: static `admin-panel/` (one HTML file, one stylesheet, one ES
module) served by the bot's own Express API. No build step, no framework, no
runtime CDN dependency — confirmed as a constraint to keep.

## Users

One user: the bot's owner, signing in through Discord OAuth. No other admins or
moderators have accounts. The owner knows every command and every server by
name, so the dashboard is an expert tool, not an onboarding surface.

## Product Purpose

palu-gada-bot is a multi-purpose Discord bot (music, AI commands, levels,
moderation, giveaways, reminders, starboard, suggestions) running as a
container on a home server. The admin panel exists so the owner can steer it
without SSH: mainly to toggle commands on and off, and to confirm the bot is
alive and behaving.

## Positioning

Self-hosted and single-tenant. The panel talks to the same process that runs
the bot, so it reports live truth from the running client and its SQLite
database rather than a synced copy.

## Operating Context

- The bot redeploys itself on every merge to `main`, so the owner checks the
  panel after a deploy.
- Sessions are short and task-shaped: open it, flip a toggle or read a number,
  close it.
- Uptime is also monitored externally by uptime-kuma, which alerts to Discord.
- Pages today: Overview, Servers, Leaderboard, Allowlist (owner), Global
  Commands (owner).

## Capabilities and Constraints

- Auth is Discord OAuth; owner-only routes are gated server-side.
- Data comes from the bot's REST API under `/api`, backed by SQLite.
- The panel is served as static files from the container; anything it needs
  must ship in the repo.
- Commands can be disabled globally or per guild.
- AI response footers carry token counts; their cost estimate is an owner-level
  toggle, off by default.

## Brand Commitments

Name: palu-gada-bot. Discord is the host platform, so its conventions
(guilds, avatars, slash commands) are product vocabulary. No logo asset exists.

## Evidence on Hand

Real data only: live guild list, member counts, command registry, level
leaderboard, audit logs. No marketing copy, no testimonials, no imagery. None
of these may be fabricated.

## Product Principles

- The owner's time is the scarce resource: the panel answers "is it alive" and
  "is this command on" without a click.
- Never invent state the bot cannot confirm.
