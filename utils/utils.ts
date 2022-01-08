export function buildParamList(numOfParams: number): string {
    let paramList = "";
    for (let index = 1; index <= numOfParams; index++) {
        if (index != numOfParams) {
            paramList += `$${index},`;
        } else {
            paramList += `$${index}`;
        }
    }
    return paramList;
}