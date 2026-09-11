/**
 * SQLite hands back "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker, while
 * values we wrote ourselves are already ISO. Normalise both to a Date, so a
 * countdown never lands hours off in a non-UTC container.
 */
export function parseDbDate(value) {
    if (value instanceof Date) return value;
    const text = String(value).replace(' ', 'T');
    return new Date(/[Z+]|-\d{2}:\d{2}$/.test(text.slice(10)) ? text : `${text}Z`);
}

/**
 * SQLite compares datetimes as text, and datetime('now') carries no "T" or
 * "Z", so an ISO string never compares correctly against it. Write this
 * format instead: UTC, second precision, "YYYY-MM-DD HH:MM:SS".
 */
export function toDbDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    return date.toISOString().slice(0, 19).replace('T', ' ');
}
