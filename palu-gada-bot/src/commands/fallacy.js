import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { askClaude } from '../utils/claudeApi.js';
import { getAiFooter } from '../config/ai.js';

const MESSAGE_LIMIT = 50;
const FETCH_CAP = 200;
const MIN_MESSAGES = 5;
const MAX_FINDINGS = 10;
const QUOTE_MAX_CHARS = 150;
const EMBED_DESC_LIMIT = 4096;
const COOLDOWN_MS = 2 * 60 * 1000;

const channelCooldowns = new Map();

const SYSTEM_PROMPT = 'You are a logic and rhetoric analyst. Identify logical fallacies in Discord conversations. Be conservative — only flag clear, textbook fallacies that appear in the reasoning of a message. Casual chatter, jokes, unsupported opinions stated as opinions, and emotional expressions are not fallacies on their own; a fallacy requires flawed reasoning in support of a claim.';

function truncate(str, max) {
    if (str.length <= max) return str;
    return str.slice(0, max - 1).trimEnd() + '…';
}

function stripJsonFence(raw) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    return fenced ? fenced[1] : raw;
}

function parseFindings(raw) {
    const stripped = stripJsonFence(raw).trim();
    const parsed = JSON.parse(stripped);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.findings)) {
        throw new Error('Response missing findings array');
    }
    const findings = [];
    for (const f of parsed.findings) {
        if (
            f
            && typeof f.message_id === 'string'
            && typeof f.fallacy_name === 'string'
            && typeof f.explanation === 'string'
        ) {
            findings.push(f);
        }
    }
    return findings;
}

export default {
    data: new SlashCommandBuilder()
        .setName('fallacy')
        .setDescription('Analyze recent messages in this channel for logical fallacies'),

    async execute(interaction) {
        if (!interaction.channel?.isTextBased()) {
            return interaction.reply({
                content: 'This command only works in text channels.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const cooldownEnd = channelCooldowns.get(interaction.channel.id);
        if (cooldownEnd && cooldownEnd > Date.now()) {
            const remaining = Math.ceil((cooldownEnd - Date.now()) / 1000);
            return interaction.reply({
                content: `This channel's fallacy check is cooling down. Try again in ${remaining}s.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply();

        const channel = interaction.channel;
        const kept = [];
        let lastId = null;
        let fetchedTotal = 0;

        try {
            while (kept.length < MESSAGE_LIMIT && fetchedTotal < FETCH_CAP) {
                const opts = { limit: 100 };
                if (lastId) opts.before = lastId;

                const page = await channel.messages.fetch(opts);
                if (page.size === 0) break;

                for (const [id, msg] of page) {
                    fetchedTotal++;
                    lastId = id;

                    if (msg.author.bot) continue;
                    if (!msg.content?.trim()) continue;

                    kept.push({
                        id: msg.id,
                        author: msg.author.displayName || msg.author.username,
                        content: msg.content,
                        url: msg.url,
                    });

                    if (kept.length >= MESSAGE_LIMIT) break;
                }
            }
        } catch (error) {
            await logCommandError(interaction, error, 'fallacy');
            return interaction.editReply({
                content: 'Error: Failed to read channel history.',
            });
        }

        if (kept.length < MIN_MESSAGES) {
            return interaction.editReply({
                embeds: [{
                    color: 0xFFFF00,
                    title: '🧐 Not Enough Messages',
                    description: `Need at least ${MIN_MESSAGES} recent messages to analyze. Found ${kept.length}.`,
                }],
            });
        }

        kept.reverse();

        const chatLog = kept
            .map(m => `[${m.id}] [${m.author}]: ${m.content}`)
            .join('\n');

        const prompt = `Analyze the following Discord chat log for logical fallacies. Return STRICT JSON matching this exact schema — no prose, no markdown outside the JSON:

{
  "findings": [
    { "message_id": "<id from the log>", "fallacy_name": "<e.g. Ad Hominem>", "explanation": "<one short sentence>" }
  ]
}

Rules:
- Return an empty findings array if there are no clear fallacies.
- At most ${MAX_FINDINGS} findings.
- At most one finding per message.
- message_id must be one of the bracketed IDs from the log below.

Chat log:
---
${chatLog}
---

JSON:`;

        let rawResponse;
        try {
            rawResponse = await askClaude(prompt, { systemPrompt: SYSTEM_PROMPT });
        } catch (error) {
            await logCommandError(interaction, error, 'fallacy');
            let msg = 'Failed to analyze chat history for fallacies.';
            if (error.status === 401) msg = 'Invalid Anthropic API key.';
            else if (error.status === 429) msg = 'Rate limited. Please try again later.';
            return interaction.editReply({ content: `Error: ${msg}` });
        }

        let findings;
        try {
            findings = parseFindings(rawResponse);
        } catch (error) {
            console.error('[ERROR] fallacy: failed to parse Claude response:', error, '\nRaw:', rawResponse);
            return interaction.editReply({
                content: 'Error: Failed to analyze chat history for fallacies.',
            });
        }

        channelCooldowns.set(interaction.channel.id, Date.now() + COOLDOWN_MS);

        const messagesById = new Map(kept.map(m => [m.id, m]));
        const resolved = [];
        for (const f of findings) {
            const msg = messagesById.get(f.message_id);
            if (!msg) continue;
            resolved.push({ ...f, message: msg });
            if (resolved.length >= MAX_FINDINGS) break;
        }

        if (resolved.length === 0) {
            return interaction.editReply({
                embeds: [{
                    color: 0x5865F2,
                    title: '🧐 No Logical Fallacies Detected',
                    description: `Analyzed the last ${kept.length} messages in ${channel} — nothing stood out.`,
                    footer: getAiFooter('', { smart: true }),
                    timestamp: new Date().toISOString(),
                }],
            });
        }

        const entries = resolved.map((f, i) => {
            const quote = truncate(f.message.content, QUOTE_MAX_CHARS);
            return `**${i + 1}. ${f.fallacy_name}** — by **${f.message.author}** · [jump](${f.message.url})\n> ${quote}\n${f.explanation}`;
        });

        let description = entries.join('\n\n');
        let omitted = 0;
        while (description.length > EMBED_DESC_LIMIT && entries.length > 1) {
            entries.pop();
            omitted++;
            description = entries.join('\n\n') + `\n\n…and ${omitted} more finding${omitted > 1 ? 's' : ''} omitted.`;
        }

        await interaction.editReply({
            embeds: [{
                color: 0xED4245,
                title: '🧐 Logical Fallacies Found',
                description,
                fields: [{
                    name: 'Analyzed',
                    value: `${kept.length} messages in ${channel}`,
                    inline: true,
                }],
                footer: getAiFooter('', { smart: true }),
                timestamp: new Date().toISOString(),
            }],
        });
    },
};
