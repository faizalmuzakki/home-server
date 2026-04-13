// ADMIN_USER_ID stays for back-compat (single user); ALLOWED_ADMIN_USERS is the
// multi-user comma-separated form, matching palu-gada-bot's ALLOWED_DEPLOY_USERS pattern.
const SINGLE = process.env.ADMIN_USER_ID?.trim();
const MULTI = (process.env.ALLOWED_ADMIN_USERS || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

const ADMIN_IDS = new Set<string>([
    ...(SINGLE ? [SINGLE] : []),
    ...MULTI,
]);

export function isAdmin(userId: string | undefined): boolean {
    if (!userId) return false;
    return ADMIN_IDS.has(userId);
}

export const PERMISSION_DENIED = "⛔ You don't have permission to use this command.";
