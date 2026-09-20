import { SlashCommandBuilder } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { askClaude } from '../utils/claudeApi.js';
import { getAiFooter, DISCORD_FORMAT_PROMPT } from '../config/ai.js';
import { sendAiReply } from '../utils/aiReply.js';

const TONES = {
    friendly: 'Warm and friendly, but not sappy.',
    professional: 'Professional and businesslike.',
    casual: 'Casual and conversational, like chatting with a friend.',
    funny: 'Light and funny. Keep the joke short.',
    formal: 'Formal and polite.',
};

/** Renders text as a Discord blockquote, so the embed shows it as quoted. */
const quote = (text) => text.split('\n').map(line => `> ${line}`).join('\n');

/**
 * Drafts the reply and sends it. Shared with the message context menu
 * command in reply-context.js, which resolves its target the easy way.
 */
export async function draftReply(interaction, target, { tone, instructions, ephemeral }) {
    const prompt = [
        `Write a reply to this Discord message from ${target.author.username}:`,
        '',
        target.content,
        '',
        `Tone: ${TONES[tone]}`,
        instructions ? `The reply must: ${instructions}` : '',
        'Output only the reply itself — no preamble, no quotes around it, no explanation.',
    ].filter(Boolean).join('\n');

    const { text: draft, model, usage } = await askClaude(prompt, {
        systemPrompt: `You write short, natural chat replies as the user. Match the language of the message you are replying to. Keep it to a few sentences unless the message clearly needs more. ${DISCORD_FORMAT_PROMPT}`,
    });

    await sendAiReply(interaction, {
        header: {
            title: '💬 Suggested reply',
            description: [
                `Replying to [${target.author.username}'s message](${target.url}):`,
                quote(target.content.slice(0, 200)),
                instructions ? `Instructions:\n${quote(instructions)}` : '',
            ].filter(Boolean).join('\n'),
            timestamp: new Date().toISOString(),
        },
        body: draft,
        footer: getAiFooter(`Tone: ${tone}`, model, usage),
        ephemeral,
        mode: 'message',
    });
}

/**
 * Turns an API error into the line the user sees. Both /reply and the
 * context menu command need the same three cases.
 */
export function replyErrorMessage(error) {
    if (error.status === 401) return 'API key is invalid or not configured.';
    if (error.status === 429) return 'Rate limited. Please try again later.';
    return 'Failed to draft a reply with Claude AI.';
}

/**
 * A slash command carries no reply context of its own, so the target is
 * resolved in three steps, most explicit first:
 *   1. the `message` option — a message id or a Discord message link,
 *   2. the message you most recently replied to in this channel,
 *   3. the last message in the channel that is not yours.
 * Step 2 is the same trick /answer uses: find your own recent message
 * that has a `reference` and follow it.
 */
async function resolveTarget(interaction, input) {
    const channel = interaction.channel;

    if (input) {
        // Accepts a bare id or a .../channels/<guild>/<channel>/<message> link.
        const id = input.trim().split('/').pop();
        return channel.messages.fetch(id);
    }

    const recent = await channel.messages.fetch({ limit: 25 });

    const ownReply = recent.find(m => m.author.id === interaction.user.id && m.reference?.messageId);
    if (ownReply) return channel.messages.fetch(ownReply.reference.messageId);

    return recent.find(m => m.author.id !== interaction.user.id && m.content.trim() !== '') ?? null;
}

export default {
    data: new SlashCommandBuilder()
        .setName('reply')
        .setDescription('Draft an AI reply to a message you replied to, or to one you name by id/link')
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('Message id or link (default: the message you last replied to here)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('tone')
                .setDescription('Tone of the reply')
                .setRequired(false)
                .addChoices(
                    { name: 'Friendly', value: 'friendly' },
                    { name: 'Professional', value: 'professional' },
                    { name: 'Casual', value: 'casual' },
                    { name: 'Funny', value: 'funny' },
                    { name: 'Formal', value: 'formal' }
                )
        )
        .addStringOption(option =>
            option
                .setName('instructions')
                .setDescription('What the reply should say or do (e.g. "decline politely")')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName('private')
                .setDescription('Only show the response to you')
                .setRequired(false)
        ),

    async execute(interaction) {
        const input = interaction.options.getString('message');
        const tone = interaction.options.getString('tone') || 'friendly';
        const instructions = interaction.options.getString('instructions');
        const isPrivate = interaction.options.getBoolean('private') || false;

        await interaction.deferReply({ ephemeral: isPrivate });

        let target;
        try {
            target = await resolveTarget(interaction, input);
        } catch {
            target = null;
        }

        if (!target || target.content.trim() === '') {
            await interaction.editReply({
                content: input
                    ? '❌ No message with that id or link in this channel.'
                    : '❌ No message to reply to. Reply to one here first, or pass its id or link.',
            });
            return;
        }

        try {
            await draftReply(interaction, target, { tone, instructions, ephemeral: isPrivate });
        } catch (error) {
            await logCommandError(interaction, error, 'reply');
            await interaction.editReply({ content: `❌ ${replyErrorMessage(error)}` });
        }
    },
};
