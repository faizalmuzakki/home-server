import { SlashCommandBuilder } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

const SUBREDDITS = ['memes', 'dankmemes', 'me_irl', 'wholesomememes', 'ProgrammerHumor'];

export default {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Get a random meme from Reddit')
        .addStringOption(option =>
            option
                .setName('subreddit')
                .setDescription('Subreddit to get meme from')
                .setRequired(false)
                .addChoices(
                    { name: 'r/memes', value: 'memes' },
                    { name: 'r/dankmemes', value: 'dankmemes' },
                    { name: 'r/me_irl', value: 'me_irl' },
                    { name: 'r/wholesomememes', value: 'wholesomememes' },
                    { name: 'r/ProgrammerHumor', value: 'ProgrammerHumor' },
                    { name: 'Random', value: 'random' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply();

        let subreddit = interaction.options.getString('subreddit') || 'random';

        if (subreddit === 'random') {
            subreddit = SUBREDDITS[Math.floor(Math.random() * SUBREDDITS.length)];
        }

        try {
            // Use Reddit's JSON API
            const response = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=100`);

            if (!response.ok) {
                throw new Error('Failed to fetch from Reddit');
            }

            const data = await response.json();
            const posts = data.data.children.filter(post => {
                const p = post.data;
                // Filter for image posts that aren't NSFW, stickied, or video
                return (
                    !p.over_18 &&
                    !p.stickied &&
                    !p.is_video &&
                    (p.url.endsWith('.jpg') ||
                     p.url.endsWith('.jpeg') ||
                     p.url.endsWith('.png') ||
                     p.url.endsWith('.gif') ||
                     p.url.includes('i.redd.it') ||
                     p.url.includes('i.imgur.com'))
                );
            });

            if (posts.length === 0) {
                return interaction.editReply({
                    content: 'No memes found! Try a different subreddit.',
                });
            }

            // Get random post
            const post = posts[Math.floor(Math.random() * posts.length)].data;

            // Fix imgur URLs
            let imageUrl = post.url;
            if (imageUrl.includes('imgur.com') && !imageUrl.includes('i.imgur.com')) {
                imageUrl = imageUrl.replace('imgur.com', 'i.imgur.com');
                if (!imageUrl.match(/\.(jpg|jpeg|png|gif)$/i)) {
                    imageUrl += '.png';
                }
            }

            const embed = {
                color: 0xFF4500, // Reddit orange
                title: post.title.slice(0, 256),
                url: `https://reddit.com${post.permalink}`,
                image: {
                    url: imageUrl,
                },
                footer: {
                    text: `👍 ${post.ups.toLocaleString()} | 💬 ${post.num_comments.toLocaleString()} | r/${subreddit}`,
                },
                timestamp: new Date(post.created_utc * 1000).toISOString(),
            };

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            // Log error to guild's log channel
            await logCommandError(interaction, error, 'meme');
            
            await interaction.editReply({
                content: 'Failed to fetch meme. Please try again later.',
            });
        }
    },
};
