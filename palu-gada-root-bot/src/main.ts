import { rootServer, RootBotStartState, ChannelMessageEvent } from "@rootsdk/server-bot";
import { initDatabase } from "./database";
import { handleMessage, loadCommands } from "./commands/handler";

async function onStarting(state: RootBotStartState) {
  console.log("Bot is starting...");

  // Initialize Database
  initDatabase();

  // Load Commands
  loadCommands();

  // Subscribe to message events
  rootServer.community.channelMessages.on(ChannelMessageEvent.ChannelMessageCreated, handleMessage);

  console.log("Bot started successfully!");
}

(async () => {
  await rootServer.lifecycle.start(onStarting);
})();
