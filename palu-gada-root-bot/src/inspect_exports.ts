import * as SDK from "@rootsdk/server-bot";

console.log("SDK Exports:");
Object.keys(SDK).forEach(key => {
    if (key.includes("ListRequest") || key.includes("ChannelMessage")) {
        console.log(key);
    }
});
