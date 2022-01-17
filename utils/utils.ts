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

/** Accepts the array and key and a returns an object with items grouped by their key */
export const groupBy = (array: any[], key: any) => {
    return array.reduce((result, currentValue) => {
      if (!result[currentValue[key]]) {
        result[currentValue[key]] = [];
      }
      result[currentValue[key]].push(currentValue);
      return result;
    }, {}); // empty object is the initial value for result object
};