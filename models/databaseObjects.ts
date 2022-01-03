export type Item = {
    id?: number;
    accountid: number;
    image1?: string;
    image2?: string;
    image3?: string;
    isavailable: boolean;
    pickedup: boolean;
    zipcode: number;
    dateposted: string;
    name: string;
    description: string;
};

export type ItemCategories = {
    itemid: number;
    category: number;
};

export type Favorite = {
    itemid: number;
    accountid: number;
};

export type Category = {
    id: number;
    description: string;
};

export type Account = {
    accountid: number;
    username: string;
    accounttype: boolean;
    email: string;
    password: string;
    avatarurl: string;
    userrating: number;
    address: string;
    zipcode: number;
    refreshtoken: string;
};

export type Chat = {
    id?: number;
    senderid: number;
    recid: number;
    message: string;
    timestamp: string;
}