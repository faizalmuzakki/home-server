export const isCommandAllowed = (interaction, allowedUsersEnv, allowedChannelIdEnv) => {
    // 1. User Permission Check
    const allowedUserIds = process.env[allowedUsersEnv] 
        ? process.env[allowedUsersEnv].split(',').map(id => id.trim()).filter(id => id.length > 0)
        : [];

    // Fail Safe: If no users are configured, disable the command entirely
    if (allowedUserIds.length === 0) {
        return { 
            allowed: false, 
            reason: `Configuration Error: No users configured in ${allowedUsersEnv}.` 
        };
    }

    if (!allowedUserIds.includes(interaction.user.id)) {
        return { 
            allowed: false, 
            reason: 'You are not authorized to use this command.' 
        };
    }

    // 2. Channel Restriction Check
    const deployChannelId = process.env[allowedChannelIdEnv];
    if (deployChannelId && interaction.channelId !== deployChannelId) {
        return { 
            allowed: false, 
            reason: 'This command can only be used in the specific admin/deploy channel.' 
        };
    }

    return { allowed: true };
};
