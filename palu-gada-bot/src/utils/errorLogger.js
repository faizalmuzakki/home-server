import { getGuildSettings, addAuditLog } from '../database/models.js';

/**
 * Log command errors to the guild's configured log channel
 * @param {Interaction} interaction - The Discord interaction
 * @param {Error} error - The error that occurred
 * @param {string} commandName - Name of the command that failed
 */
export async function logCommandError(interaction, error, commandName) {
    // Always log to console
    console.error(`[ERROR] ${commandName} command error:`, error);

    // Log to guild's log channel if configured
    if (!interaction.guildId) return;

    try {
        const settings = getGuildSettings(interaction.guildId);
        if (!settings?.log_enabled || !settings?.log_channel_id) return;

        const logChannel = await interaction.client.channels.fetch(settings.log_channel_id).catch(() => null);
        if (!logChannel) return;

        // Prepare error message
        let errorMessage = error.message || 'Unknown error';
        
        // Include cause if it's a certificate error or other nested error
        if (error.cause) {
            errorMessage += `\nCause: ${error.cause.message || error.cause}`;
            if (error.cause.code) {
                errorMessage += ` (${error.cause.code})`;
            }
        }

        await logChannel.send({
            embeds: [{
                color: 0xED4245, // Red for errors
                title: '⚠️ Command Error',
                fields: [
                    {
                        name: 'Command',
                        value: `\`/${commandName}\``,
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
                        value: `\`\`\`${errorMessage.slice(0, 1000)}\`\`\``,
                        inline: false,
                    },
                ],
                timestamp: new Date().toISOString(),
            }],
        }).catch(err => {
            console.error('[ERROR] Failed to send error log to channel:', err);
        });

        // Also add to audit log database
        addAuditLog(
            interaction.guildId,
            'COMMAND_ERROR',
            interaction.user.id,
            null,
            `Command /${commandName} failed: ${errorMessage.slice(0, 500)}`
        );
    } catch (logError) {
        console.error('[ERROR] Failed to log error to guild channel:', logError);
    }
}
