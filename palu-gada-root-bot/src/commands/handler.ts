import { ChannelMessageCreatedEvent, MessageType, rootServer, JobScheduleEvent } from "@rootsdk/server-bot";
import { Command, CommandContext } from "./Command";

import { pingCommand } from "./utility/ping";
import { summarizeCommand } from "./utility/summarize";
import { askCommand } from "./utility/ask";
import { mathCommand } from "./utility/math";
import { defineCommand } from "./utility/define";
import { urbanCommand } from "./utility/urban";
import { todoCommand } from "./productivity/todo";
import { remindCommand, handleReminderJob } from "./productivity/remind";
import { noteCommand } from "./productivity/note";
import { balanceCommand, dailyCommand, levelCommand, addXp } from "./economy";
import { warnCommand, warningsCommand, kickCommand, banCommand, autoroleCommand } from "./moderation";
import { birthdayCommand, confessionCommand, giveawayCommand, handleGiveawayJob, eightBallCommand, rollCommand, jokeCommand, memeCommand } from "./fun";
import { initStarboard } from "../features/starboard";

const commands: Map<string, Command> = new Map();
const aliases: Map<string, string> = new Map();

export function registerCommand(command: Command) {
    commands.set(command.name, command);
    if (command.aliases) {
        command.aliases.forEach(alias => aliases.set(alias, command.name));
    }
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
    console.log(`[DEBUG] Received event:`, JSON.stringify(event, null, 2));
    
    if (!content || !content.startsWith("/")) {
        console.log(`[DEBUG] Message is not a command.`);
        return;
    }

    const args = content.slice(1).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();
    console.log(`[DEBUG] Parsed command name: "${commandName}"`);

    if (!commandName) return;

    const command = commands.get(commandName) || commands.get(aliases.get(commandName) || "");
    console.log(`[DEBUG] Command found: ${!!command}`);

    if (command) {
        try {
            console.log(`[DEBUG] Executing command: ${commandName}`);
            const result = await command.execute({ event, args, server: rootServer });
            console.log(`[DEBUG] Command ${commandName} execution result:`, JSON.stringify(result, null, 2));
            console.log(`[DEBUG] Command ${commandName} executed successfully.`);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `Error executing command: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
        }
    } else {
        console.log(`[DEBUG] Command "${commandName}" not found in registered commands.`);
    }
}

export function loadCommands() {
    registerCommand(pingCommand);
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

    registerCommand(warnCommand);
    registerCommand(warningsCommand);
    registerCommand(kickCommand);
    registerCommand(banCommand);
    registerCommand(autoroleCommand);

    registerCommand(birthdayCommand);
    registerCommand(confessionCommand);
    registerCommand(giveawayCommand);
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
