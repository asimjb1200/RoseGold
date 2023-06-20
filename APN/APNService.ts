import http2 from 'http2';
import { AlertDictionary, PushNotificationCategory, RemoteNotification } from '../models/pushNotifications.js';
import { randomUUID } from 'crypto';
import { userLogger } from '../loggers/logger.js';
import { UnreadMessage } from '../models/databaseObjects.js';
import { ChatWithUsername } from '../models/dtos.js';

/** use this method to send the notifcations to the APN for delivery to the user
 * @param deviceToken - the hexadecimal bytes that identify the user’s device. Your app receives the bytes for this device token when registering for remote notifications
 */
export function sendToAPNServer(deviceToken: string, apnAccessToken: string, payload: RemoteNotification) {
    const identifier = randomUUID();
    const headers: http2.OutgoingHttpHeaders = {
        authorization: `bearer ${apnAccessToken}`,
        'apns-id': identifier,
        'apns-topic': 'TechWorldSolutions.RoseGoldMarket',
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        ':scheme': 'https'
    };

    const client = http2.connect(process.env.APNDEV!);

    client.on('error', (err) => {
        //console.error("Error during notifiication: " + err);
        userLogger.error(`[APN] Tried to send a request through the APN. ID: ${identifier}: ${err}`);
    });

    const request = client.request(headers);
    // request.on('response', (headers, flags) => {
    //     for (const name in headers) {
    //         console.log(`${name}: ${headers[name]}`);
    //     }
    // });
    request.setEncoding('utf8');
    let data = '';
    request.on('data', (chunk) => {
        data += chunk;
    });
    request.write(JSON.stringify(payload));
    request.on('end', () => {
        //console.log(`\n${data}\n\t done sending noti`);
        client.close();
    });
    request.end();
}

export function generateAPNPayload(notificationType: PushNotificationCategory, additionalInfo: ChatWithUsername): RemoteNotification {
    let alert: AlertDictionary;
    switch (notificationType) {
        case "MESSAGE":
            alert = {
                title: `${additionalInfo.senderUsername}`,
                body: `${additionalInfo.message}`
            }
            break;
        case "APP UPDATE":
            alert = {
                title: "Update Available",
                subtitle: "Update the app to get the latest features"
            }
    }
    let payload: RemoteNotification = {
        aps: {
            category: notificationType,
            alert
        },
        messageSenderId: additionalInfo.senderid,
        messageId: additionalInfo.id,
        viewingUserId: additionalInfo.recid,
    };

    return payload;
}
