import { ChannelMessageCreatedEvent, MessageType, rootServer, JobScheduleEvent } from "@rootsdk/server-bot";
import { Command, CommandContext } from "./Command";
import db from "../database";

import { pingCommand } from "./utility/ping";
import { summarizeCommand } from "./utility/summarize";
import { askCommand } from "./utility/ask";
import { answerCommand } from "./utility/answer";
import { mathCommand } from "./utility/math";
import { defineCommand } from "./utility/define";
import { urbanCommand } from "./utility/urban";
import { helpCommand } from "./utility/help";
import { animeCommand, mangaCommand } from "./utility/anime";
import { dramaCommand } from "./utility/drama";
import { tldrCommand } from "./utility/tldr";
import { explainCommand } from "./utility/explain";
import { translateCommand } from "./utility/translate";
import { recapCommand } from "./utility/recap";
import { weatherCommand } from "./utility/weather";
import { qrcodeCommand } from "./utility/qrcode";
import { shortenCommand } from "./utility/shorten";
import { emojiCommand } from "./utility/emoji";
import { userinfoCommand } from "./utility/userinfo";
import { serverinfoCommand } from "./utility/serverinfo";
import { avatarCommand } from "./utility/avatar";
import { todoCommand } from "./productivity/todo";
import { remindCommand, handleReminderJob } from "./productivity/remind";
import { noteCommand } from "./productivity/note";
import { afkCommand } from "./productivity/afk";
import { countdownCommand } from "./productivity/countdown";
import { welcomerCommand } from "./automation/welcomer";
import { autoresponderCommand } from "./automation/autoresponder";
import { levelchannelCommand } from "./automation/levelchannel";
import { logsCommand } from "./automation/logs";
import { statschannelCommand } from "./automation/statschannel";
import { autothreadCommand } from "./automation/autothread";
import { reactionroleCommand } from "./automation/reactionrole";
import { balanceCommand, dailyCommand, levelCommand, topRolesCommand, leaderboardCommand, addXp } from "./economy";
import { warnCommand, warningsCommand, kickCommand, banCommand, autoroleCommand, timeoutCommand, untimeoutCommand, modlogCommand } from "./moderation";
import { birthdayCommand, confessionCommand, giveawayCommand, handleGiveawayJob, eightBallCommand, rollCommand, jokeCommand, memeCommand, starboardCommand, pollCommand } from "./fun";
import { handlePollJob } from "./fun/poll";
import { triviaCommand, handleTriviaJob } from "./fun/trivia";
import { initStarboard } from "../features/starboard";
import { handleAfkOnMessage } from "../features/afk";
import { handleAutoresponderOnMessage } from "../features/autoresponder";
import { handleAutothreadOnMessage } from "../features/autothread";

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
    const rawContent = event.messageContent ?? "";

    await handleAfkOnMessage(event);

    // XP System
    if (event.userId && event.communityId) {
        const leveledUp = addXp(event.userId, event.communityId);
        if (leveledUp) {
            const levelChannel = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'level_channel_id'")
                .get(event.communityId) as { value: string } | undefined;
            const levelEnabled = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'level_enabled'")
                .get(event.communityId) as { value: string } | undefined;
            await rootServer.community.channelMessages.create({
                channelId: levelChannel?.value && levelEnabled?.value !== "0"
                    ? levelChannel.value as any
                    : event.channelId,
                content: `🎉 <@${event.userId}> has leveled up!`,
            });
        }
    }

    await handleAutoresponderOnMessage(event);
    await handleAutothreadOnMessage(event);

    const content = rawContent;

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
    registerCommand(answerCommand);
    registerCommand(tldrCommand);
    registerCommand(explainCommand);
    registerCommand(translateCommand);
    registerCommand(recapCommand);
    registerCommand(weatherCommand);
    registerCommand(qrcodeCommand);
    registerCommand(shortenCommand);
    registerCommand(emojiCommand);
    registerCommand(userinfoCommand);
    registerCommand(serverinfoCommand);
    registerCommand(avatarCommand);
    registerCommand(mathCommand);
    registerCommand(defineCommand);
    registerCommand(urbanCommand);
    registerCommand(animeCommand);
    registerCommand(mangaCommand);
    registerCommand(dramaCommand);

    registerCommand(todoCommand);
    registerCommand(remindCommand);
    registerCommand(noteCommand);
    registerCommand(afkCommand);
    registerCommand(countdownCommand);
    registerCommand(welcomerCommand);
    registerCommand(autoresponderCommand);
    registerCommand(levelchannelCommand);
    registerCommand(logsCommand);
    registerCommand(statschannelCommand);
    registerCommand(autothreadCommand);
    registerCommand(reactionroleCommand);

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
    registerCommand(triviaCommand);

    // Subscribe to job events
    rootServer.jobScheduler.on(JobScheduleEvent.Job, async (job) => {
        await handleReminderJob(job);
        await handleGiveawayJob(job);
        await handlePollJob(job);
        await handleTriviaJob(job);
    });

    // Initialize Starboard
    initStarboard();

    console.log(`Loaded ${commands.size} commands.`);
}
