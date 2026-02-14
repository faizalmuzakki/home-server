import { ChannelMessageCreatedEvent, RootServer } from "@rootsdk/server-bot";

export interface CommandContext {
    event: ChannelMessageCreatedEvent;
    args: string[];
    server: RootServer;
}

export interface Command {
    name: string;
    description: string;
    aliases?: string[];
    usage?: string;
    category?: string;
    execute: (context: CommandContext) => Promise<void>;
}
