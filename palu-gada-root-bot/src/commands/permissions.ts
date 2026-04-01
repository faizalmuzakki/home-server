const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

export function isAdmin(userId: string | undefined): boolean {
    if (!userId) return false;
    return !!ADMIN_USER_ID && userId === ADMIN_USER_ID;
}

export const PERMISSION_DENIED = "⛔ You don't have permission to use this command.";
