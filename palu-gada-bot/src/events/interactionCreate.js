import { Events, MessageFlags } from 'discord.js';
import { isCommandEnabled, getGuildSettings, addAuditLog } from '../database/models.js';
import { checkGuildAccess } from '../config.js';

export function register(client) {
    client.on(Events.InteractionCreate, async (interaction) => {
        if (interaction.isButton()) {
            if (interaction.customId === 'giveaway_enter') {
                const giveawayCommand = client.commands.get('giveaway');
                if (giveawayCommand && giveawayCommand.handleButton) {
                    try {
                        await giveawayCommand.handleButton(interaction);
                    } catch (error) {
                        console.error('[ERROR] Giveaway button error:', error);
                    }
                }
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        if (interaction.guildId && !checkGuildAccess(interaction.guildId)) {
            return interaction.reply({
                content: 'This bot is not authorized to operate in this server.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`[ERROR] No command matching ${interaction.commandName} was found.`);
            return;
        }

        if (interaction.guildId && !isCommandEnabled(interaction.guildId, interaction.commandName)) {
            return interaction.reply({
                content: `The \`/${interaction.commandName}\` command is disabled in this server.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`[ERROR] Error executing command ${interaction.commandName}:`, error);

            if (interaction.guildId) {
                try {
                    const settings = getGuildSettings(interaction.guildId);
                    if (settings?.log_enabled && settings?.log_channel_id) {
                        const logChannel = await client.channels.fetch(settings.log_channel_id).catch(() => null);
                        if (logChannel) {
                            await logChannel.send({
                                embeds: [{
                                    color: 0xED4245,
                                    title: '⚠️ Command Error',
                                    fields: [
                                        {
                                            name: 'Command',
                                            value: `\`/${interaction.commandName}\``,
                                            inline: true,
                                        },
                                        {
                                            name: 'User',
                                            value: `${interaction.user.tag} (${interaction.user.id})`,
                                            inline: true,
                                        },
                                        {
                                            name: 'Channel',
                                            value: `<#${interaction.channelId}>`,
                                            inline: true,
                                        },
                                        {
                                            name: 'Error',
                                            value: `\`\`\`${error.message?.slice(0, 1000) || 'Unknown error'}\`\`\``,
                                            inline: false,
                                        },
                                    ],
                                    timestamp: new Date().toISOString(),
                                }],
                            }).catch(() => { });

                            addAuditLog(
                                interaction.guildId,
                                'COMMAND_ERROR',
                                interaction.user.id,
                                null,
                                `Command /${interaction.commandName} failed: ${error.message?.slice(0, 500)}`
                            );
                        }
                    }
                } catch (logError) {
                    console.error('[ERROR] Failed to log error to guild channel:', logError);
                }
            }

            const errorMessage = {
                content: 'There was an error executing this command!',
                flags: MessageFlags.Ephemeral,
            };

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            } catch {
                // Couldn't respond to interaction
            }
        }
    });
}
