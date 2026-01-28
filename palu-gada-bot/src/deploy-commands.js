import { REST, Routes } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load all commands
for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(`file://${filePath}`);

    if ('data' in command.default) {
        commands.push(command.default.data.toJSON());
        console.log(`[INFO] Loaded command: ${command.default.data.name}`);
    }
}

// Get tokens from environment
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // Optional: for guild-specific commands

if (!token || !clientId) {
    console.error('[ERROR] DISCORD_TOKEN and CLIENT_ID must be set in environment variables!');
    process.exit(1);
}

const rest = new REST().setToken(token);

async function deployCommands() {
    try {
        console.log(`[INFO] Started refreshing ${commands.length} application (/) commands.`);

        let data;

        if (guildId) {
            // Deploy to specific guild (instant, good for testing)
            data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands }
            );
            console.log(`[INFO] Successfully deployed ${data.length} commands to guild ${guildId}`);
        } else {
            // Deploy globally (can take up to an hour to propagate)
            data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands }
            );
            console.log(`[INFO] Successfully deployed ${data.length} commands globally`);
        }

        console.log('[INFO] Command deployment complete!');
    } catch (error) {
        console.error('[ERROR] Error deploying commands:', error);
    }
}

deployCommands();
