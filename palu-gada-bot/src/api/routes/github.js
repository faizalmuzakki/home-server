import express from 'express';
import crypto from 'crypto';
import { getAllGithubWebhooks } from '../../database/models.js';
import { getDiscordClient } from '../server.js';

const router = express.Router();

// Verify GitHub webhook signature
function verifySignature(payload, signature, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

// Format GitHub webhook payload into Discord embed
function formatGithubEvent(event, payload) {
    const embeds = [];

    switch (event) {
        case 'push': {
            const commits = payload.commits || [];
            const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
            const commitCount = commits.length;
            
            if (commitCount === 0) break;

            const commitList = commits.slice(0, 5).map(c => 
                `[\`${c.id.substring(0, 7)}\`](${c.url}) ${c.message.split('\n')[0].slice(0, 80)}`
            ).join('\n');

            embeds.push({
                color: 0x6E5494,
                author: {
                    name: `${payload.pusher?.name || payload.sender?.login} pushed to ${branch}`,
                    icon_url: payload.sender?.avatar_url,
                    url: payload.compare,
                },
                description: `**[${payload.repository.full_name}](${payload.repository.html_url})**\n\n${commitList}${commitCount > 5 ? `\n\n*...and ${commitCount - 5} more commit${commitCount - 5 !== 1 ? 's' : ''}*` : ''}`,
                footer: {
                    text: `${commitCount} commit${commitCount !== 1 ? 's' : ''}`,
                },
                timestamp: new Date().toISOString(),
            });
            break;
        }

        case 'pull_request': {
            const pr = payload.pull_request;
            const action = payload.action;
            
            const colors = {
                opened: 0x57F287,
                closed: pr.merged ? 0x8957E5 : 0xED4245,
                reopened: 0x57F287,
                merged: 0x8957E5,
            };

            const actionText = action === 'closed' && pr.merged ? 'merged' : action;

            embeds.push({
                color: colors[actionText] || 0x5865F2,
                author: {
                    name: `${payload.sender.login} ${actionText} pull request #${pr.number}`,
                    icon_url: payload.sender.avatar_url,
                    url: pr.html_url,
                },
                title: pr.title,
                url: pr.html_url,
                description: `**[${payload.repository.full_name}](${payload.repository.html_url})**\n\n${pr.body?.slice(0, 300) || '*No description*'}${pr.body?.length > 300 ? '...' : ''}`,
                fields: [
                    {
                        name: 'Branch',
                        value: `\`${pr.head.ref}\` → \`${pr.base.ref}\``,
                        inline: true,
                    },
                    {
                        name: 'Changes',
                        value: `+${pr.additions} -${pr.deletions}`,
                        inline: true,
                    },
                ],
                timestamp: new Date().toISOString(),
            });
            break;
        }

        case 'issues': {
            const issue = payload.issue;
            const action = payload.action;

            const colors = {
                opened: 0x57F287,
                closed: 0xED4245,
                reopened: 0x57F287,
            };

            embeds.push({
                color: colors[action] || 0x5865F2,
                author: {
                    name: `${payload.sender.login} ${action} issue #${issue.number}`,
                    icon_url: payload.sender.avatar_url,
                    url: issue.html_url,
                },
                title: issue.title,
                url: issue.html_url,
                description: `**[${payload.repository.full_name}](${payload.repository.html_url})**\n\n${issue.body?.slice(0, 300) || '*No description*'}${issue.body?.length > 300 ? '...' : ''}`,
                timestamp: new Date().toISOString(),
            });
            break;
        }

        case 'release': {
            const release = payload.release;
            const action = payload.action;

            embeds.push({
                color: 0xFEE75C,
                author: {
                    name: `${payload.sender.login} ${action} release ${release.tag_name}`,
                    icon_url: payload.sender.avatar_url,
                    url: release.html_url,
                },
                title: release.name || release.tag_name,
                url: release.html_url,
                description: `**[${payload.repository.full_name}](${payload.repository.html_url})**\n\n${release.body?.slice(0, 500) || '*No release notes*'}${release.body?.length > 500 ? '...' : ''}`,
                timestamp: new Date().toISOString(),
            });
            break;
        }

        case 'create': {
            const refType = payload.ref_type;
            const ref = payload.ref;

            embeds.push({
                color: 0x57F287,
                author: {
                    name: `${payload.sender.login} created ${refType} ${ref}`,
                    icon_url: payload.sender.avatar_url,
                },
                description: `**[${payload.repository.full_name}](${payload.repository.html_url})**`,
                timestamp: new Date().toISOString(),
            });
            break;
        }

        case 'delete': {
            const refType = payload.ref_type;
            const ref = payload.ref;

            embeds.push({
                color: 0xED4245,
                author: {
                    name: `${payload.sender.login} deleted ${refType} ${ref}`,
                    icon_url: payload.sender.avatar_url,
                },
                description: `**[${payload.repository.full_name}](${payload.repository.html_url})**`,
                timestamp: new Date().toISOString(),
            });
            break;
        }

        case 'star': {
            const action = payload.action;
            embeds.push({
                color: 0xFEE75C,
                author: {
                    name: `${payload.sender.login} ${action === 'created' ? 'starred' : 'unstarred'} ${payload.repository.full_name}`,
                    icon_url: payload.sender.avatar_url,
                    url: payload.repository.html_url,
                },
                description: `⭐ **${payload.repository.stargazers_count}** stars`,
                timestamp: new Date().toISOString(),
            });
            break;
        }

        case 'fork': {
            embeds.push({
                color: 0x5865F2,
                author: {
                    name: `${payload.sender.login} forked ${payload.repository.full_name}`,
                    icon_url: payload.sender.avatar_url,
                    url: payload.forkee.html_url,
                },
                description: `🍴 **${payload.repository.forks_count}** forks`,
                timestamp: new Date().toISOString(),
            });
            break;
        }

        default:
            // Unsupported event, return empty
            break;
    }

    return embeds;
}

// GitHub webhook endpoint
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    try {
        const signature = req.headers['x-hub-signature-256'];
        const event = req.headers['x-github-event'];
        
        if (!signature || !event) {
            return res.status(400).json({ error: 'Missing GitHub headers' });
        }

        // Parse payload
        const payload = JSON.parse(req.body.toString());
        const repository = payload.repository;
        const organization = payload.organization;

        if (!repository) {
            return res.status(400).json({ error: 'No repository in payload' });
        }

        // Get all webhooks and find matching ones
        const allWebhooks = getAllGithubWebhooks();
        const matchingWebhooks = allWebhooks.filter(webhook => {
            // Verify signature
            if (!verifySignature(req.body, signature, webhook.webhook_secret)) {
                return false;
            }

            // Check if event is in the webhook's event list
            if (!webhook.events.includes(event) && !webhook.events.includes('*')) {
                return false;
            }

            // Filter by organization
            if (webhook.organization && organization?.login !== webhook.organization) {
                return false;
            }

            // Filter by repository
            if (webhook.repository && repository.name !== webhook.repository) {
                return false;
            }

            return true;
        });

        if (matchingWebhooks.length === 0) {
            return res.status(200).json({ message: 'No matching webhooks found' });
        }

        // Format the event
        const embeds = formatGithubEvent(event, payload);

        if (embeds.length === 0) {
            return res.status(200).json({ message: 'Event not supported or no embeds generated' });
        }

        // Send to all matching Discord channels
        const client = getDiscordClient();
        if (!client) {
            return res.status(500).json({ error: 'Discord client not available' });
        }

        for (const webhook of matchingWebhooks) {
            try {
                const channel = await client.channels.fetch(webhook.channel_id);
                if (channel) {
                    await channel.send({ embeds });
                }
            } catch (error) {
                console.error(`[ERROR] Failed to send GitHub webhook to channel ${webhook.channel_id}:`, error);
            }
        }

        res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (error) {
        console.error('[ERROR] GitHub webhook error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
