import log4js from "log4js";

log4js.configure({
    appenders: {
        userLogs: {type: "file", filename: "build/logs/users/userlogs.log", maxLogSize: 10485760, backups: 1, compress: true},
        itemLogs: {type: "file", filename: "build/logs/items/itemlogs.log", maxLogSize: 10485760, backups: 1, compress: true},
        chatLogs: {type: "file", filename: "build/logs/chat/chatlogs.log", maxLogSize: 10485760, backups: 1, compress: true},
        tokenErrors: { type: "file", filename: "build/logs/tokens/tokenLogs.log", maxLogSize: 10485760, backups: 1, compress: true },
        networkingLogs: {type: "file", filename: "build/logs/networking/nwlogs.log", maxLogSize: 10485760, backups: 1, compress: true},
        console: { type: 'console' }
    },
    categories: {
        userLogs: {appenders: ["userLogs"], level: "trace"},
        tokenLogs: { appenders: ["tokenErrors"], level: "debug"},
        itemLogs: {appenders: ["itemLogs"], level: "debug"},
        chatLogs: {appenders: ["chatLogs"], level: "debug"},
        networkingLogs: {appenders: ["networkingLogs"], level: "debug"},
        default: { appenders: ['console'], level: 'trace' }
    }
});

/** for any errors or logging pertaining to users */
const userLogger = log4js.getLogger("userLogs");
/** for any errors or logging pertaining to flowers and other products */
const itemLogger = log4js.getLogger("itemLogs");
/** for any errors or logging pertaining to messages between users */
const chatLogger = log4js.getLogger("chatLogs");
/** for any errors or logging pertaining to networking and fetching outside resources */
const networkLogger = log4js.getLogger("networkingLogs");
/** for any errors or logging pertaining to JWT's */
const tokenLogger = log4js.getLogger("tokenLogs");

export {
    userLogger, chatLogger, itemLogger, networkLogger, tokenLogger
};