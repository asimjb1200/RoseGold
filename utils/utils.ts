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
    // Return the end result
    return array.reduce((result, currentValue) => {
      // If an array already present for key, push it to the array. Else create an array and push the object
      if (!result[currentValue[key]]) {
        result[currentValue[key]] = [];
      }
      result[currentValue[key]].push(currentValue);
      // Return the current iteration `result` value, this will be taken as next iteration `result` value and accumulate
      return result;
    }, {}); // empty object is the initial value for result object
};