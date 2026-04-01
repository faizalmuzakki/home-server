import { rootServer, RootBotStartState, ChannelMessageEvent, ChannelGuid } from "@rootsdk/server-bot";
import { initDatabase } from "./database";
import db from "./database";
import { handleMessage, loadCommands } from "./commands/handler";
import { initAutoroleFeature } from "./features/autorole";
import { initHealthCheck } from "./features/health";
import { initWelcomerFeature } from "./features/welcomer";
import { initLogsFeature } from "./features/logs";
import { initStatsChannelFeature } from "./features/statschannel";
import { initReactionRoleFeature } from "./features/reactionrole";

async function checkBirthdays() {
    const now = new Date();
    const day = now.getUTCDate();
    const month = now.getUTCMonth() + 1;

    const birthdays = db.prepare(
        "SELECT user_id, guild_id FROM birthdays WHERE day = ? AND month = ?"
    ).all(day, month) as { user_id: string; guild_id: string }[];

    for (const entry of birthdays) {
        const setting = db.prepare(
            "SELECT value FROM guild_settings WHERE guild_id = ? AND key = 'birthday_channel_id'"
        ).get(entry.guild_id) as { value: string } | undefined;

        if (!setting?.value) continue;

        try {
            await rootServer.community.channelMessages.create({
                channelId: setting.value as unknown as ChannelGuid,
                content: `🎂 Happy Birthday <@${entry.user_id}>! 🎉 Wishing you an amazing day!`,
            });
        } catch (e) {
            console.error(`Failed to send birthday message for ${entry.user_id}:`, e);
        }
    }
}

function scheduleBirthdayCheck() {
    const now = new Date();
    const nextMidnight = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
    ));
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    setTimeout(() => {
        checkBirthdays();
        setInterval(checkBirthdays, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);

    console.log(`Birthday checker scheduled — first run in ${Math.round(msUntilMidnight / 60000)} min`);
}

async function onStarting(state: RootBotStartState) {
  console.log("Bot is starting...");

  // Initialize Health Check Server
  initHealthCheck(3051);

  // Initialize Database
  initDatabase();

  // Load Commands
  loadCommands();

  // Subscribe to message events
  rootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageCreated, handleMessage);

  // Initialize Features
  initAutoroleFeature();
  initWelcomerFeature();
  initLogsFeature();
  initStatsChannelFeature();
  initReactionRoleFeature();

  // Birthday announcer — fires at UTC midnight daily
  scheduleBirthdayCheck();

  console.log("Bot started successfully!");
}

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();
