export type RemoteNotification = {
    aps: APS;
    messageSenderId?: number;
    messageId?: string;
    viewingUserId?: number;
}

export type APS = {
    alert?: string | AlertDictionary;
    badge?: number;
    sound?: string | Sound;
    'thread-id'?: string;
    category?: PushNotificationCategory;
    'content-available'?: number;
    'mutable-content'?: number;
    'target-content-id'?: string;
    'interruption-level'?: string;
    'relevance-score'?: number;
    'filter-criteria'?: string;
    'stale-date'?: number;
    'content-state'?: any;
    timestamp?: number;
    events?: string;
    'dismissal-date'?: number;
}

export type AlertDictionary = {
    subtitle?: string;
    title?: string;
    body?: string;
    'launch-image'?: string;
    'title-loc-key'?: string;
    'title-loc-args'?: string[];
    'subtitle-loc-key'?: string;
    'subtitle-loc-args'?: string[];
    'loc-key'?: string;
    'loc-args'?: string[];
}

export type APNJWT = {
    iss: string; 
    iat: number;
    exp: number;
}

export type PushNotificationCategory = "MESSAGE" | "APP UPDATE";

export type Sound = {
    critical?: number;
    name?: string;
    volume?: number;
}