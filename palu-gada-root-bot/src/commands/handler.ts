import { ChannelMessageCreatedEvent, MessageType, rootServer, JobScheduleEvent } from "@rootsdk/server-bot";
import { Command, CommandContext } from "./Command";
import db from "../database";

import { pingCommand } from "./utility/ping";
import { summarizeCommand } from "./utility/summarize";
import { askCommand } from "./utility/ask";
import { mathCommand } from "./utility/math";
import { defineCommand } from "./utility/define";
import { urbanCommand } from "./utility/urban";
import { helpCommand } from "./utility/help";
import { todoCommand } from "./productivity/todo";
import { remindCommand, handleReminderJob } from "./productivity/remind";
import { noteCommand } from "./productivity/note";
import { balanceCommand, dailyCommand, levelCommand, topRolesCommand, leaderboardCommand, addXp } from "./economy";
import { warnCommand, warningsCommand, kickCommand, banCommand, autoroleCommand, timeoutCommand, untimeoutCommand, modlogCommand } from "./moderation";
import { birthdayCommand, confessionCommand, giveawayCommand, handleGiveawayJob, eightBallCommand, rollCommand, jokeCommand, memeCommand, starboardCommand, pollCommand } from "./fun";
import { initStarboard } from "../features/starboard";

const commands: Map<string, Command> = new Map();
const aliases: Map<string, string> = new Map();

// Per-user cooldowns: key = "userId:commandName" → last used timestamp
const cooldowns = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 3_000;

// Prune stale cooldown entries every 10 minutes to prevent unbounded memory growth
setInterval(() => {
    const cutoff = Date.now() - DEFAULT_COOLDOWN_MS;
    for (const [key, ts] of cooldowns) {
        if (ts < cutoff) cooldowns.delete(key);
    }
}, 10 * 60 * 1000).unref();

export function registerCommand(command: Command) {
    commands.set(command.name, command);
    if (command.aliases) {
        command.aliases.forEach(alias => aliases.set(alias, command.name));
    }
}

export function getCommands(): Map<string, Command> {
    return commands;
}

export async function handleMessage(event: ChannelMessageCreatedEvent) {
    if (event.messageType === MessageType.System) return;

    // XP System
    if (event.userId && event.communityId) {
        const leveledUp = addXp(event.userId, event.communityId);
        if (leveledUp) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `🎉 <@${event.userId}> has leveled up!`,
            });
        }
    }

    const content = event.messageContent;

    if (!content || !content.startsWith("/")) return;

    const args = content.slice(1).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    const command = commands.get(commandName) || commands.get(aliases.get(commandName) || "");

    if (!command) return;

    // Check if user is currently timed out
    if (event.userId && event.communityId) {
        const timeout = db.prepare(
            "SELECT expires_at FROM timeouts WHERE user_id = ? AND guild_id = ? AND active = 1 ORDER BY expires_at DESC LIMIT 1"
        ).get(event.userId, event.communityId) as { expires_at: number } | undefined;

        if (timeout) {
            if (Date.now() < timeout.expires_at) {
                const expiresTs = Math.floor(timeout.expires_at / 1000);
                await rootServer.community.channelMessages.create({
                    channelId: event.channelId,
                    content: `🔇 You are timed out until <t:${expiresTs}:R>.`,
                });
                return;
            } else {
                // Timeout expired — deactivate it
                db.prepare("UPDATE timeouts SET active = 0 WHERE user_id = ? AND guild_id = ? AND active = 1")
                    .run(event.userId, event.communityId);
            }
        }
    }

    // Per-user command cooldown (3 s)
    const cooldownKey = `${event.userId}:${commandName}`;
    const lastUsed = cooldowns.get(cooldownKey) || 0;
    const remaining = DEFAULT_COOLDOWN_MS - (Date.now() - lastUsed);
    if (remaining > 0) {
        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `⏳ Please wait **${(remaining / 1000).toFixed(1)}s** before using \`/${commandName}\` again.`,
        });
        return;
    }
    cooldowns.set(cooldownKey, Date.now());

    try {
        await command.execute({ event, args, server: rootServer });
    } catch (error) {
        console.error(`Error executing command ${commandName}:`, error);
        await rootServer.community.channelMessages.create({
            channelId: event.channelId,
            content: `Error executing command: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
    }
}

export function loadCommands() {
    registerCommand(pingCommand);
    registerCommand(helpCommand);
    registerCommand(summarizeCommand);
    registerCommand(askCommand);
    registerCommand(mathCommand);
    registerCommand(defineCommand);
    registerCommand(urbanCommand);

    registerCommand(todoCommand);
    registerCommand(remindCommand);
    registerCommand(noteCommand);

    registerCommand(balanceCommand);
    registerCommand(dailyCommand);
    registerCommand(levelCommand);
    registerCommand(topRolesCommand);
    registerCommand(leaderboardCommand);

    registerCommand(warnCommand);
    registerCommand(warningsCommand);
    registerCommand(kickCommand);
    registerCommand(banCommand);
    registerCommand(timeoutCommand);
    registerCommand(untimeoutCommand);
    registerCommand(modlogCommand);
    registerCommand(autoroleCommand);

    registerCommand(birthdayCommand);
    registerCommand(confessionCommand);
    registerCommand(giveawayCommand);
    registerCommand(starboardCommand);
    registerCommand(pollCommand);
    registerCommand(eightBallCommand);
    registerCommand(rollCommand);
    registerCommand(jokeCommand);
    registerCommand(memeCommand);

    // Subscribe to job events
    rootServer.jobScheduler.on(JobScheduleEvent.Job, async (job) => {
        await handleReminderJob(job);
        await handleGiveawayJob(job);
    });

    // Initialize Starboard
    initStarboard();

    console.log(`Loaded ${commands.size} commands.`);
}
