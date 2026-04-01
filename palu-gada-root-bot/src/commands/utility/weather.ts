import { rootServer } from "@rootsdk/server-bot";
import { Command, CommandContext } from "../Command";

export const weatherCommand: Command = {
    name: "weather",
    description: "Get weather information for a location",
    usage: "/weather <location> [metric|imperial|standard]",
    category: "Utility",
    execute: async (context: CommandContext) => {
        const { event, args } = context;
        const unitsCandidate = args[args.length - 1]?.toLowerCase();
        const units = ["metric", "imperial", "standard"].includes(unitsCandidate) ? unitsCandidate : "metric";
        const location = (["metric", "imperial", "standard"].includes(unitsCandidate) ? args.slice(0, -1) : args).join(" ").trim();

        if (!location) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: "Usage: `/weather <location> [metric|imperial|standard]`",
            });
            return;
        }

        try {
            const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`);
            if (!response.ok) throw new Error("Location not found");
            const data = await response.json() as any;
            const current = data.current_condition?.[0];
            const area = data.nearest_area?.[0];
            if (!current) throw new Error("Invalid weather response");

            const temp = units === "imperial"
                ? `${current.temp_F}°F`
                : units === "standard"
                    ? `${(parseFloat(current.temp_C) + 273.15).toFixed(1)}K`
                    : `${current.temp_C}°C`;
            const feelsLike = units === "imperial"
                ? `${current.FeelsLikeF}°F`
                : units === "standard"
                    ? `${(parseFloat(current.FeelsLikeC) + 273.15).toFixed(1)}K`
                    : `${current.FeelsLikeC}°C`;
            const locationName = area
                ? `${area.areaName?.[0]?.value || location}, ${area.country?.[0]?.value || ""}`.trim()
                : location;

            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `**Weather in ${locationName}**\nCondition: ${current.weatherDesc?.[0]?.value || "Unknown"}\nTemperature: ${temp} (feels like ${feelsLike})\nWind: ${current.windspeedKmph} km/h ${current.winddir16Point}\nHumidity: ${current.humidity}%\nVisibility: ${current.visibility} km`,
            });
        } catch (error) {
            await rootServer.community.channelMessages.create({
                channelId: event.channelId,
                content: `Could not find weather for **${location}**.`,
            });
        }
    }
};
