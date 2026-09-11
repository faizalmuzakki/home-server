const UNITS = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/**
 * Parses 30m / 12h / 3d / 1w into milliseconds. Returns null for anything
 * unparseable, zero-length, or longer than maxMs.
 */
export function parseDuration(input, maxMs = 14 * 86_400_000) {
    const match = /^(\d+)\s*(m|h|d|w)$/i.exec(String(input ?? '').trim());
    if (!match) return null;

    const amount = parseInt(match[1], 10);
    if (!amount) return null;

    const ms = amount * UNITS[match[2].toLowerCase()];
    return ms > maxMs ? null : ms;
}
