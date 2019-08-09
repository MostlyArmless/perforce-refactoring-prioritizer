export function validateStartDate(startDate: string): boolean {
    const matchResult = startDate.match(/(\d{4})\/(\d{2})\/(\d{2})/);
    if (!matchResult) {
        return false;
    }
    const year = parseInt(matchResult[1]);
    const month = parseInt(matchResult[2]);
    const day = parseInt(matchResult[3]);
    const now = new Date();
    if (year > now.getFullYear()
        || year < 2016
        || month > now.getMonth()+1
        || month > 12
        || month < 0
        || day > 31
        || day < 0) {
            return false;
        }
    return true;
}