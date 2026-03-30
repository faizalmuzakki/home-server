import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { addAutoresponder, removeAutoresponder, getAutoresponders } from '../database/models.js';

const MATCH_TYPES = {
    contains:   'contains (anywhere in message)',
    exact:      'exact match',
    startswith: 'starts with',
};

export default {
    data: new SlashCommandBuilder()
        .setName('autoresponder')
        .setDescription('Auto-reply to messages that match a keyword or phrase')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a new auto-response trigger')
                .addStringOption(opt =>
                    opt.setName('trigger')
                        .setDescription('Word or phrase to watch for')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('response')
                        .setDescription('Message the bot will reply with')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('match')
                        .setDescription('How to match the trigger (default: contains)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Contains (anywhere in message)', value: 'contains' },
                            { name: 'Exact match',                    value: 'exact' },
                            { name: 'Starts with',                    value: 'startswith' },
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove an auto-response by ID')
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('ID shown in /autoresponder list')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all auto-responses for this server')
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'add') {
            const trigger = interaction.options.getString('trigger');
            const response = interaction.options.getString('response');
            const matchType = interaction.options.getString('match') || 'contains';

            if (trigger.length > 100) {
                return interaction.reply({
                    content: 'Trigger must be 100 characters or fewer.',
                    flags: MessageFlags.Ephemeral,
                });
            }
            if (response.length > 2000) {
                return interaction.reply({
                    content: 'Response must be 2000 characters or fewer.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            addAutoresponder(interaction.guildId, trigger, response, matchType, interaction.user.id);

            await interaction.reply({
                embeds: [{
                    color: 0x57F287,
                    title: '✅ Auto-Response Added',
                    fields: [
                        { name: 'Trigger',    value: `\`${trigger}\``,              inline: true },
                        { name: 'Match type', value: MATCH_TYPES[matchType],        inline: true },
                        { name: 'Response',   value: response.slice(0, 1024) },
                    ],
                }],
            });

        } else if (sub === 'remove') {
            const id = interaction.options.getInteger('id');
            const result = removeAutoresponder(id, interaction.guildId);

            if (result.changes === 0) {
                return interaction.reply({
                    content: `No auto-response with ID **${id}** found in this server.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `✅ Auto-response #${id} removed.`,
                flags: MessageFlags.Ephemeral,
            });

        } else if (sub === 'list') {
            const responders = getAutoresponders(interaction.guildId);

            if (responders.length === 0) {
                return interaction.reply({
                    content: 'No auto-responses configured. Use `/autoresponder add` to create one.',
                    flags: MessageFlags.Ephemeral,
                });
            }

            const lines = responders.slice(0, 20).map(r =>
                `**#${r.id}** \`${r.trigger}\` *(${r.match_type})* → ${r.response.slice(0, 60)}${r.response.length > 60 ? '…' : ''}`
            ).join('\n');

            await interaction.reply({
                embeds: [{
                    color: 0x5865F2,
                    title: '🤖 Auto-Responses',
                    description: lines,
                    footer: {
                        text: responders.length > 20
                            ? `Showing 20 of ${responders.length}`
                            : `${responders.length} auto-response${responders.length !== 1 ? 's' : ''}`,
                    },
                }],
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};
