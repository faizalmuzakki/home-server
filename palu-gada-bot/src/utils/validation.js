export const isCommandAllowed = (interaction, allowedUsersEnv, allowedChannelIdEnv) => {
    // 1. User Permission Check
    const allowedUserIds = process.env[allowedUsersEnv] 
        ? process.env[allowedUsersEnv].split(',').map(id => id.trim()) 
        : [];

    if (allowedUserIds.length > 0 && !allowedUserIds.includes(interaction.user.id)) {
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
