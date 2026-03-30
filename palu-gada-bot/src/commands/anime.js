import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

const JIKAN_BASE = 'https://api.jikan.moe/v4';

function buildAnimeEmbed(entry) {
    const title = entry.title_english || entry.title;
    const japanese = entry.title_japanese;
    const score = entry.score ? `⭐ ${entry.score}/10` : 'N/A';
    const rank = entry.rank ? `#${entry.rank}` : 'N/A';
    const genres = entry.genres?.map(g => g.name).join(', ') || 'Unknown';
    const synopsis = (entry.synopsis || 'No synopsis available.')
        .replace(/\[Written by MAL Rewrite\]/gi, '')
        .trim()
        .slice(0, 380);

    return {
        color: 0x2E51A2, // MAL blue
        title: `🎌 ${title}`,
        url: entry.url,
        description: japanese && japanese !== title ? `*${japanese}*` : undefined,
        thumbnail: { url: entry.images?.jpg?.large_image_url || entry.images?.jpg?.image_url || '' },
        fields: [
            {
                name: 'Info',
                value: [
                    `**Type:** ${entry.type || 'Unknown'}`,
                    `**Episodes:** ${entry.episodes ?? '?'}`,
                    `**Status:** ${entry.status || 'Unknown'}`,
                    entry.season && entry.year ? `**Season:** ${capitalize(entry.season)} ${entry.year}` : entry.year ? `**Year:** ${entry.year}` : null,
                ].filter(Boolean).join('  ·  '),
                inline: false,
            },
            {
                name: 'Score',
                value: `${score}  ·  Rank: ${rank}  ·  Popularity: #${entry.popularity ?? '?'}`,
                inline: false,
            },
            { name: 'Genres', value: genres.slice(0, 200) || 'Unknown', inline: false },
            { name: 'Synopsis', value: synopsis + (entry.synopsis?.length > 380 ? '…' : ''), inline: false },
        ],
        footer: { text: 'Source: MyAnimeList via Jikan' },
        timestamp: new Date().toISOString(),
    };
}

function buildMangaEmbed(entry) {
    const title = entry.title_english || entry.title;
    const japanese = entry.title_japanese;
    const score = entry.score ? `⭐ ${entry.score}/10` : 'N/A';
    const rank = entry.rank ? `#${entry.rank}` : 'N/A';
    const genres = entry.genres?.map(g => g.name).join(', ') || 'Unknown';
    const synopsis = (entry.synopsis || 'No synopsis available.')
        .replace(/\[Written by MAL Rewrite\]/gi, '')
        .trim()
        .slice(0, 380);

    return {
        color: 0x2E51A2,
        title: `📚 ${title}`,
        url: entry.url,
        description: japanese && japanese !== title ? `*${japanese}*` : undefined,
        thumbnail: { url: entry.images?.jpg?.large_image_url || entry.images?.jpg?.image_url || '' },
        fields: [
            {
                name: 'Info',
                value: [
                    `**Type:** ${entry.type || 'Unknown'}`,
                    `**Chapters:** ${entry.chapters ?? '?'}`,
                    `**Volumes:** ${entry.volumes ?? '?'}`,
                    `**Status:** ${entry.status || 'Unknown'}`,
                ].join('  ·  '),
                inline: false,
            },
            {
                name: 'Score',
                value: `${score}  ·  Rank: ${rank}  ·  Popularity: #${entry.popularity ?? '?'}`,
                inline: false,
            },
            { name: 'Genres', value: genres.slice(0, 200) || 'Unknown', inline: false },
            { name: 'Synopsis', value: synopsis + (entry.synopsis?.length > 380 ? '…' : ''), inline: false },
        ],
        footer: { text: 'Source: MyAnimeList via Jikan' },
        timestamp: new Date().toISOString(),
    };
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export default {
    data: new SlashCommandBuilder()
        .setName('anime')
        .setDescription('Search MyAnimeList for anime or manga')
        .addSubcommand(sub =>
            sub
                .setName('search')
                .setDescription('Search for an anime on MyAnimeList')
                .addStringOption(opt =>
                    opt.setName('query').setDescription('Anime title to search for').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('manga')
                .setDescription('Search for a manga on MyAnimeList')
                .addStringOption(opt =>
                    opt.setName('query').setDescription('Manga title to search for').setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const query = interaction.options.getString('query').trim();

        await interaction.deferReply();

        try {
            const type = subcommand === 'manga' ? 'manga' : 'anime';
            const url = `${JIKAN_BASE}/${type}?q=${encodeURIComponent(query)}&limit=5&sfw=false`;
            const res = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout(10_000),
            });

            if (!res.ok) throw new Error(`Jikan API error: ${res.status}`);
            const json = await res.json();
            const results = json.data;

            if (!results?.length) {
                return interaction.editReply({
                    content: `No ${type} found for **${query}**.`,
                });
            }

            const entry = results[0];
            const embed = type === 'manga' ? buildMangaEmbed(entry) : buildAnimeEmbed(entry);

            const extraCount = results.length - 1;
            const searchUrl = `https://myanimelist.net/${type}.php?q=${encodeURIComponent(query)}&cat=${type}`;
            if (extraCount > 0) {
                embed.footer.text += `  ·  ${extraCount} more result${extraCount > 1 ? 's' : ''} — [see all](${searchUrl})`;
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await logCommandError(interaction, error, 'anime');
            await interaction.editReply({
                content: 'Failed to fetch from MyAnimeList. Please try again later.',
            });
        }
    },
};
