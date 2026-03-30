import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

// Kuryana: community-maintained REST wrapper around MyDramaList
const KURYANA_BASE = 'https://kuryana.vercel.app';
const MDL_BASE = 'https://mydramalist.com';

export default {
    data: new SlashCommandBuilder()
        .setName('drama')
        .setDescription('Search MyDramaList for dramas, movies, or variety shows')
        .addSubcommand(sub =>
            sub
                .setName('search')
                .setDescription('Search MyDramaList')
                .addStringOption(opt =>
                    opt.setName('query').setDescription('Title to search for').setRequired(true)
                )
        ),

    async execute(interaction) {
        const query = interaction.options.getString('query').trim();
        await interaction.deferReply();

        try {
            // Step 1: search
            const searchRes = await fetch(
                `${KURYANA_BASE}/search/q/${encodeURIComponent(query)}`,
                {
                    headers: { 'Accept': 'application/json' },
                    signal: AbortSignal.timeout(10_000),
                }
            );

            if (!searchRes.ok) throw new Error(`Kuryana search error: ${searchRes.status}`);
            const searchJson = await searchRes.json();
            const results = searchJson.results;

            if (!results?.length) {
                return interaction.editReply({ content: `No results found on MyDramaList for **${query}**.` });
            }

            const top = results[0];

            // Step 2: fetch details for the top result
            let detail = null;
            try {
                const detailRes = await fetch(
                    `${KURYANA_BASE}/id/${encodeURIComponent(top.slug)}`,
                    {
                        headers: { 'Accept': 'application/json' },
                        signal: AbortSignal.timeout(8_000),
                    }
                );
                if (detailRes.ok) detail = await detailRes.json();
            } catch {
                // Fall back to summary data from search
            }

            const data = detail?.data ?? top;
            const title = data.title || top.title;
            const type = data.type || top.type || 'Drama';
            const country = data.country || top.country || '';
            const year = data.year || top.year || '';
            const rating = data.rating ?? null;
            const synopsis = (data.synopsis || data.description || 'No synopsis available.')
                .trim()
                .slice(0, 400);
            const image = data.poster || data.image || top.image || '';
            const genres = Array.isArray(data.genres)
                ? data.genres.map(g => (typeof g === 'string' ? g : g.name)).join(', ')
                : '';
            const episodes = data.episodes ?? null;
            const status = data.status || '';
            const slug = top.slug || '';
            const malUrl = slug ? `${MDL_BASE}/${slug}` : `${MDL_BASE}/search?q=${encodeURIComponent(query)}`;

            const metaParts = [
                type,
                country,
                year,
            ].filter(Boolean).join('  ·  ');

            const fields = [];

            if (metaParts) {
                fields.push({ name: 'Info', value: metaParts, inline: false });
            }

            const statsParts = [
                rating ? `⭐ ${rating}/10` : null,
                episodes ? `${episodes} episodes` : null,
                status || null,
            ].filter(Boolean);
            if (statsParts.length) {
                fields.push({ name: 'Stats', value: statsParts.join('  ·  '), inline: false });
            }

            if (genres) {
                fields.push({ name: 'Genres', value: genres.slice(0, 200), inline: false });
            }

            fields.push({
                name: 'Synopsis',
                value: synopsis + (synopsis.length >= 400 ? '…' : ''),
                inline: false,
            });

            const embed = {
                color: 0x1B5E96, // MDL blue
                title: `🎬 ${title}`,
                url: malUrl,
                thumbnail: image ? { url: image } : undefined,
                fields,
                footer: { text: 'Source: MyDramaList via Kuryana' },
                timestamp: new Date().toISOString(),
            };

            const extra = results.length - 1;
            if (extra > 0) {
                const searchUrl = `${MDL_BASE}/search?q=${encodeURIComponent(query)}`;
                embed.footer.text += `  ·  ${extra} more result${extra > 1 ? 's' : ''} — ${searchUrl}`;
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await logCommandError(interaction, error, 'drama');
            await interaction.editReply({
                content: 'Failed to fetch from MyDramaList. Please try again later.',
            });
        }
    },
};
