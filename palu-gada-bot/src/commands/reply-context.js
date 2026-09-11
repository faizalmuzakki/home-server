import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';
import { draftReply, replyErrorMessage } from './reply.js';

/**
 * The only interaction Discord gives that actually knows which message you
 * meant: right-click a message, Apps, "Reply with AI". /reply has to guess
 * its target; this one is handed it.
 *
 * Always ephemeral — a draft is for the person who asked for it, and this
 * fires on someone else's message.
 */
export default {
    data: new ContextMenuCommandBuilder()
        .setName('Reply with AI')
        .setType(ApplicationCommandType.Message),

    async execute(interaction) {
        const target = interaction.targetMessage;

        await interaction.deferReply({ ephemeral: true });

        if (!target || target.content.trim() === '') {
            await interaction.editReply({ content: '❌ That message has no text to reply to.' });
            return;
        }

        try {
            await draftReply(interaction, target, { tone: 'friendly', instructions: null, ephemeral: true });
        } catch (error) {
            await logCommandError(interaction, error, 'Reply with AI');
            await interaction.editReply({ content: `❌ ${replyErrorMessage(error)}` });
        }
    },
};
