import { rootServer } from "@rootsdk/server-bot";

console.log("Inspecting rootServer.community.channelMessages:");
const channelMessages = rootServer.community.channelMessages;
for (const key in channelMessages) {
    console.log(key);
}

console.log("\nPrototype methods:");
let proto = Object.getPrototypeOf(channelMessages);
while (proto) {
    console.log(Object.getOwnPropertyNames(proto));
    proto = Object.getPrototypeOf(proto);
}
