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

// Startup hardening: any failure in lifecycle.start (auth, network, etc.) must
// crash the process so Docker's restart policy can recover us, instead of leaving
// a zombie "container up, bot never started" state.
let startupCompleted = false;

process.on("unhandledRejection", (error) => {
    console.error("[ERROR] Unhandled promise rejection:", error);
    if (!startupCompleted) {
        console.error("[FATAL] Unhandled rejection before bot started — exiting for restart.");
        process.exit(1);
    }
});

async function startWithRetry({ maxAttempts = 5, baseDelayMs = 2000 } = {}) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await rootServer.lifecycle.start(onStarting);
            startupCompleted = true;
            return;
        } catch (error: unknown) {
            const willRetry = attempt < maxAttempts;
            const err = error as { code?: string; name?: string; message?: string };
            console.error(
                `[ERROR] Root bot start attempt ${attempt}/${maxAttempts} failed: ${err.code || err.name || "Error"} — ${err.message || error}`
            );
            if (!willRetry) throw error;
            const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 30_000);
            console.log(`Retrying start in ${Math.round(delay / 1000)}s...`);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
}

(async () => {
    try {
        await startWithRetry();
    } catch (error) {
        console.error("[FATAL] Root bot could not start after retries — exiting for restart.", error);
        process.exit(1);
    }
})();
