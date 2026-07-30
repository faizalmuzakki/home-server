import { getPendingReminders, markReminderCompleted } from '../database/models.js';
import { formatTimeAgo } from '../utils/timeFormat.js';

export function start(client) {
    setInterval(async () => {
        try {
            const reminders = getPendingReminders();

            for (const reminder of reminders) {
                try {
                    const user = await client.users.fetch(reminder.user_id).catch(() => null);

                    if (user) {
                        const embed = {
                            color: 0x5865F2,
                            title: '⏰ Reminder!',
                            description: reminder.message,
                            footer: {
                                text: `Set ${formatTimeAgo(new Date(reminder.created_at))}`,
                            },
                            timestamp: new Date().toISOString(),
                        };

                        let sent = false;
                        try {
                            await user.send({ embeds: [embed] });
                            sent = true;
                        } catch (e) {
                            // DMs disabled, try channel
                        }

                        if (!sent && reminder.channel_id) {
                            const channel = await client.channels.fetch(reminder.channel_id).catch(() => null);
                            if (channel) {
                                await channel.send({
                                    content: `<@${reminder.user_id}>`,
                                    embeds: [embed],
                                });
                            }
                        }
                    }

                    markReminderCompleted(reminder.id);
                } catch (e) {
                    console.error(`[ERROR] Failed to send reminder ${reminder.id}:`, e);
                }
            }
        } catch (e) {
            console.error('[ERROR] Reminder checker error:', e);
        }
    }, 30000);

    console.log('[INFO] Reminder checker started');
}
