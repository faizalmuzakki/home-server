import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import config, { validateConfig } from './config.js';
import { addAllowedGuild } from './database/models.js';
import { startApiServer, setDiscordClient } from './api/server.js';

// Event handlers
import { register as registerInteractionCreate } from './events/interactionCreate.js';
import { register as registerGuildMemberAdd } from './events/guildMemberAdd.js';
import { register as registerMessageCreate } from './events/messageCreate.js';
import { register as registerMessageUpdate } from './events/messageUpdate.js';
import { register as registerMessageDelete } from './events/messageDelete.js';
import { register as registerMessageReactionAdd } from './events/messageReactionAdd.js';
import { register as registerMessageReactionRemove } from './events/messageReactionRemove.js';
import { register as registerGuildCreate } from './events/guildCreate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

validateConfig();

if (config.allowedGuildsEnv.length > 0) {
    for (const guildId of config.allowedGuildsEnv) {
        addAllowedGuild(guildId.trim(), 'env', 'Seeded from ALLOWED_GUILDS env var');
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.commands = new Collection();
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(`file://${filePath}`);

    if (command.default && 'data' in command.default && 'execute' in command.default) {
        client.commands.set(command.default.data.name, command.default);
    } else {
        console.log(`[WARNING] Command at ${filePath} is missing "data" or "execute" property.`);
    }
}

// Register event handlers
registerInteractionCreate(client);
registerGuildMemberAdd(client);
registerMessageCreate(client);
registerMessageUpdate(client);
registerMessageDelete(client);
registerMessageReactionAdd(client);
registerMessageReactionRemove(client);
registerGuildCreate(client);

client.on(Events.Error, (error) => console.error('[ERROR] Discord client error:', error));

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[INFO] Bot is ready! Logged in as ${readyClient.user.tag}`);
    console.log(`[INFO] Serving ${readyClient.guilds.cache.size} guild(s)`);

    if (config.apiEnabled) {
        setDiscordClient(client);
        await startApiServer(config.apiPort);
    }

    const { start: startReminders } = await import('./services/reminderScheduler.js');
    const { start: startMessages } = await import('./services/messageScheduler.js');
    const { start: startGiveaways } = await import('./services/giveawayScheduler.js');
    const { start: startStats } = await import('./services/statsChannelUpdater.js');
    const { start: startBirthdays } = await import('./services/birthdayScheduler.js');
    const { start: startVoiceXp } = await import('./services/voiceXpTracker.js');

    startReminders(client);
    startMessages(client);
    startGiveaways(client);
    startStats(client);
    startBirthdays(client);
    startVoiceXp(client);
});

let loginCompleted = false;
client.once(Events.ClientReady, () => { loginCompleted = true; });

process.on('unhandledRejection', (error) => {
    console.error('[ERROR] Unhandled promise rejection:', error);
    if (!loginCompleted) {
        console.error('[FATAL] Unhandled rejection before bot was ready — exiting for restart.');
        process.exit(1);
    }
});

process.on('SIGINT', () => { console.log('[INFO] Shutting down...'); client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { console.log('[INFO] Shutting down...'); client.destroy(); process.exit(0); });

async function loginWithRetry({ maxAttempts = 5, baseDelayMs = 2000 } = {}) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await client.login(config.token);
            return;
        } catch (error) {
            const willRetry = attempt < maxAttempts;
            console.error(
                `[ERROR] Discord login attempt ${attempt}/${maxAttempts} failed: ${error?.code || error?.name || 'Error'} — ${error?.message || error}`
            );
            if (!willRetry) throw error;
            const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 30_000);
            console.log(`[INFO] Retrying login in ${Math.round(delay / 1000)}s...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

try {
    await loginWithRetry();
} catch (error) {
    console.error('[FATAL] Could not log in to Discord after retries — exiting for restart.', error);
    process.exit(1);
}
