"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var server_bot_1 = require("@rootsdk/server-bot");
console.log("Inspecting rootServer.community.channelMessages:");
var channelMessages = server_bot_1.rootServer.community.channelMessages;
for (var key in channelMessages) {
    console.log(key);
}
console.log("\nPrototype methods:");
var proto = Object.getPrototypeOf(channelMessages);
while (proto) {
    console.log(Object.getOwnPropertyNames(proto));
    proto = Object.getPrototypeOf(proto);
}
