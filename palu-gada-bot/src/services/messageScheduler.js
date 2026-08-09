import { getPendingScheduledMessages, markScheduledMessageSent } from '../database/models.js';

export function start(client) {
    setInterval(async () => {
        try {
            const pending = getPendingScheduledMessages();
            for (const msg of pending) {
                try {
                    const channel = await client.channels.fetch(msg.channel_id).catch(() => null);
                    if (channel?.isTextBased()) {
                        await channel.send(msg.message);
                    }
                    markScheduledMessageSent(msg.id);
                } catch (e) {
                    console.error(`[ERROR] Failed to deliver scheduled message ${msg.id}:`, e);
                }
            }
        } catch (e) {
            console.error('[ERROR] Scheduled message dispatcher error:', e);
        }
    }, 30000);

    console.log('[INFO] Scheduled message dispatcher started');
}
