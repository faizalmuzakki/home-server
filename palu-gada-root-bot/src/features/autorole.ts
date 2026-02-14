import { rootServer, CommunityEvent, CommunityJoinedEvent } from "@rootsdk/server-bot";
import db from "../database";

export function initAutoroleFeature() {
  console.log("Initializing Auto-Role feature...");

  rootServer.community.communities.on(CommunityEvent.CommunityJoined, async (event: CommunityJoinedEvent) => {
    const { communityId, userId } = event;
    console.log(`User ${userId} joined community ${communityId}. Checking auto-role settings...`);

    try {
      // Get auto-role settings for this guild
      const enabledSetting = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?")
        .get(communityId, 'autorole_enabled');
      
      if (!enabledSetting || enabledSetting.value !== '1') {
        console.log(`Auto-role is disabled for community ${communityId}.`);
        return;
      }

      const roleIdSetting = db.prepare("SELECT value FROM guild_settings WHERE guild_id = ? AND key = ?")
        .get(communityId, 'autorole_id');

      if (!roleIdSetting || !roleIdSetting.value) {
        console.log(`Auto-role is enabled but no role ID is configured for community ${communityId}.`);
        return;
      }

      const roleId = roleIdSetting.value;
      console.log(`Assigning auto-role ${roleId} to user ${userId} in community ${communityId}...`);

      await rootServer.community.communityMemberRoles.add({
        communityRoleId: roleId,
        userIds: [userId]
      });

      console.log(`Successfully assigned auto-role ${roleId} to ${userId}.`);
    } catch (error) {
      console.error(`Error in auto-role for user ${userId} in community ${communityId}:`, error);
    }
  });
}
