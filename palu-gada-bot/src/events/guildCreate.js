import { Events } from 'discord.js';
import { checkGuildAccess } from '../config.js';

export function register(client) {
    client.on(Events.GuildCreate, (guild) => {
        console.log(`[INFO] Joined new guild: ${guild.name} (${guild.id})`);

        if (!checkGuildAccess(guild.id)) {
            console.log(`[INFO] Guild ${guild.id} is not in allowlist, leaving...`);
            guild.leave().catch(console.error);
        }
    });
}
