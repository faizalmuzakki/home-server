import { Events } from 'discord.js';
import { getReactionRole } from '../database/models.js';
import { checkGuildAccess } from '../config.js';

export function register(client) {
    client.on(Events.MessageReactionRemove, async (reaction, user) => {
        if (user.bot) return;

        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch {
                return;
            }
        }

        if (!reaction.message.guild) return;
        if (!checkGuildAccess(reaction.message.guild.id)) return;

        const emojiIdentifier = reaction.emoji.id || reaction.emoji.name;

        const reactionRole = getReactionRole(
            reaction.message.guild.id,
            reaction.message.id,
            emojiIdentifier
        );

        if (!reactionRole) return;

        try {
            const member = await reaction.message.guild.members.fetch(user.id);
            const role = reaction.message.guild.roles.cache.get(reactionRole.role_id);

            if (role && member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
                console.log(`[INFO] Removed role ${role.name} from ${user.tag} via reaction role`);
            }
        } catch (error) {
            console.error('[ERROR] Failed to remove reaction role:', error);
        }
    });
}
