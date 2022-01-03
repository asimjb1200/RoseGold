/** the data parameter will take the shape of whatever type that needs to be returned */
export type ResponseBody <T> = {
    dataForClient: T;
    newAccessToken?: string;
}