import { SlashCommandBuilder } from 'discord.js';
import { logCommandError } from '../utils/errorLogger.js';

const WEATHER_EMOJIS = {
    'Clear': '☀️',
    'Clouds': '☁️',
    'Rain': '🌧️',
    'Drizzle': '🌦️',
    'Thunderstorm': '⛈️',
    'Snow': '❄️',
    'Mist': '🌫️',
    'Fog': '🌫️',
    'Haze': '🌫️',
    'Dust': '🌪️',
    'Sand': '🌪️',
    'Ash': '🌋',
    'Squall': '💨',
    'Tornado': '🌪️',
};

export default {
    data: new SlashCommandBuilder()
        .setName('weather')
        .setDescription('Get weather information for a location')
        .addStringOption(option =>
            option
                .setName('location')
                .setDescription('City name or location')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('units')
                .setDescription('Temperature units')
                .setRequired(false)
                .addChoices(
                    { name: 'Celsius (°C)', value: 'metric' },
                    { name: 'Fahrenheit (°F)', value: 'imperial' },
                    { name: 'Kelvin (K)', value: 'standard' }
                )
        ),

    async execute(interaction) {
        const location = interaction.options.getString('location');
        const units = interaction.options.getString('units') || 'metric';

        await interaction.deferReply();

        try {
            // Use wttr.in for weather data (no API key required)
            const response = await fetch(
                `https://wttr.in/${encodeURIComponent(location)}?format=j1`
            );

            if (!response.ok) {
                throw new Error('Location not found');
            }

            const data = await response.json();

            if (!data.current_condition || !data.current_condition[0]) {
                throw new Error('Invalid response from weather service');
            }

            const current = data.current_condition[0];
            const area = data.nearest_area?.[0];
            const forecast = data.weather?.[0];

            // Get temperature based on units
            let temp, feelsLike, unitSymbol;
            if (units === 'imperial') {
                temp = current.temp_F;
                feelsLike = current.FeelsLikeF;
                unitSymbol = '°F';
            } else if (units === 'standard') {
                temp = (parseFloat(current.temp_C) + 273.15).toFixed(1);
                feelsLike = (parseFloat(current.FeelsLikeC) + 273.15).toFixed(1);
                unitSymbol = 'K';
            } else {
                temp = current.temp_C;
                feelsLike = current.FeelsLikeC;
                unitSymbol = '°C';
            }

            const weatherDesc = current.weatherDesc?.[0]?.value || 'Unknown';
            const weatherMain = weatherDesc.split(' ')[0];
            const emoji = WEATHER_EMOJIS[weatherMain] || '🌡️';

            const locationName = area
                ? `${area.areaName?.[0]?.value || ''}, ${area.country?.[0]?.value || ''}`
                : location;

            const embed = {
                color: 0x5865F2,
                title: `${emoji} Weather in ${locationName}`,
                thumbnail: {
                    url: `https://wttr.in/${encodeURIComponent(location)}_0pq.png`,
                },
                fields: [
                    {
                        name: '🌡️ Temperature',
                        value: `**${temp}${unitSymbol}**\nFeels like ${feelsLike}${unitSymbol}`,
                        inline: true,
                    },
                    {
                        name: '☁️ Condition',
                        value: weatherDesc,
                        inline: true,
                    },
                    {
                        name: '💨 Wind',
                        value: `${current.windspeedKmph} km/h ${current.winddir16Point}`,
                        inline: true,
                    },
                    {
                        name: '💧 Humidity',
                        value: `${current.humidity}%`,
                        inline: true,
                    },
                    {
                        name: '👁️ Visibility',
                        value: `${current.visibility} km`,
                        inline: true,
                    },
                    {
                        name: '🌡️ Pressure',
                        value: `${current.pressure} hPa`,
                        inline: true,
                    },
                ],
                footer: {
                    text: `Last updated: ${current.observation_time}`,
                },
                timestamp: new Date().toISOString(),
            };

            // Add forecast if available
            if (forecast) {
                let minTemp, maxTemp;
                if (units === 'imperial') {
                    minTemp = forecast.mintempF;
                    maxTemp = forecast.maxtempF;
                } else if (units === 'standard') {
                    minTemp = (parseFloat(forecast.mintempC) + 273.15).toFixed(1);
                    maxTemp = (parseFloat(forecast.maxtempC) + 273.15).toFixed(1);
                } else {
                    minTemp = forecast.mintempC;
                    maxTemp = forecast.maxtempC;
                }

                embed.fields.push({
                    name: '📅 Today\'s Range',
                    value: `Low: ${minTemp}${unitSymbol} | High: ${maxTemp}${unitSymbol}`,
                    inline: false,
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await logCommandError(interaction, error, 'weather');

            await interaction.editReply({
                content: `Could not find weather for **${location}**. Please check the location name and try again.`,
            });
        }
    },
};
