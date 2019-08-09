export function sanitizeDateString(date: string): string {
    return date.replace(/\//g, '-');
}

export function sanitizeDate(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}