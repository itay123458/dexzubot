import { Events } from "discord.js";
import { logger, startupLog } from "../utils/logger.js";
import config from "../config/application.js";
import { reconcileReactionRoleMessages } from "../services/reactionRoleService.js";
import { reconcileTicketPanels, reconcileVerificationPanels, reconcileReactionRolePanelHealth } from "../services/panelHealthService.js";
import { reconcileLevelRoles } from "../services/leveling/levelRoleSyncService.js";
import { initRiffyAfterReady } from "../services/music/riffySetup.js";
import { initializePresenceMirror } from "../services/presenceMirrorService.js";
import { initializeYouTubeAlerts } from "../services/youtubeAlertService.js";
import { initializeTimedSoftbans } from "../services/moderation/timedSoftbanService.js";
import { initializeOperationsHealthChecks } from "../services/dashboardOperationsService.js";
import { refreshConfiguredPanelDesigns } from "../services/panelDesignService.js";
import { loadEmbedMotion } from "../services/embedMotionService.js";
import { getCommunityGuildIds } from '../config/community.js';
import { loadCommunityMotion } from '../services/communityMotionService.js';
import { getCommunityConfig } from '../services/communityBetaService.js';
import { initializeInviteRewards } from '../services/betaInviteRewardsService.js';
import { initializeStaffWorkflows } from '../services/betaStaffService.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    try {
      await loadEmbedMotion(client);
      try { await loadCommunityMotion(client); }
      catch(error) { logger.warn('Animated arrows unavailable; using static markers.',{error:error.message}); }
      if (getCommunityGuildIds().length) {
        try {
        for(const id of getCommunityGuildIds()) if(client.guilds.cache.has(id)) await getCommunityConfig(client,id);
        const inviteWarnings=await initializeInviteRewards(client);
        if(inviteWarnings.length) logger.warn('Invite tracking baseline unavailable',inviteWarnings);
        client.communityStaffCleanup?.();
        client.communityStaffCleanup=initializeStaffWorkflows(client);
        } catch(error) { logger.warn('Community initialization failed; existing bot services will continue.',{error:error.message}); }
      }
      await initializePresenceMirror(client);
      initializeYouTubeAlerts(client);
      const restoredSoftbans = await initializeTimedSoftbans(client);
      client.operationsHealthTimer = initializeOperationsHealthChecks(client);

      startupLog(`Ready! Logged in as ${client.user.tag}`);
      startupLog(`Serving ${client.guilds.cache.size} guild(s)`);
      startupLog(`Loaded ${client.commands.size} commands`);
      startupLog(`Timed softbans restored: ${restoredSoftbans}`);

      if (client.config?.features?.music) {
        initRiffyAfterReady(client);
      }

      const reconciliationSummary = await reconcileReactionRoleMessages(client);
      startupLog(
        `Reaction role reconciliation: scanned ${reconciliationSummary.scannedMessages}, removed ${reconciliationSummary.removedMessages}, errors ${reconciliationSummary.errors}`
      );

      const ticketPanelSummary = await reconcileTicketPanels(client);
      startupLog(
        `Ticket panel health: scanned ${ticketPanelSummary.scannedGuilds} guilds, healthy ${ticketPanelSummary.healthyPanels}, deleted ${ticketPanelSummary.deletedPanels}, missing channel ${ticketPanelSummary.missingChannels}, recovered ${ticketPanelSummary.recoveredIds}, errors ${ticketPanelSummary.errors}`
      );

      const verificationPanelSummary = await reconcileVerificationPanels(client);
      startupLog(
        `Verification panel health: scanned ${verificationPanelSummary.scannedGuilds} guilds, healthy ${verificationPanelSummary.healthyPanels}, deleted ${verificationPanelSummary.deletedPanels}, missing channel ${verificationPanelSummary.missingChannels}, recovered ${verificationPanelSummary.recoveredIds}, errors ${verificationPanelSummary.errors}`
      );

      const reactionRolePanelSummary = await reconcileReactionRolePanelHealth(client);
      startupLog(
        `Reaction role panel health: scanned ${reactionRolePanelSummary.scannedPanels} panels, healthy ${reactionRolePanelSummary.healthyPanels}, deleted ${reactionRolePanelSummary.deletedPanels}, missing channel ${reactionRolePanelSummary.missingChannels}, recovered ${reactionRolePanelSummary.recoveredIds}, errors ${reactionRolePanelSummary.errors}`
      );

      const panelDesignSummary = await refreshConfiguredPanelDesigns(client);
      startupLog(`Panel design refresh: ${JSON.stringify(panelDesignSummary)}`);

      if (client.config?.features?.leveling) {
        const levelRoleSummary = await reconcileLevelRoles(client);
        startupLog(
          `Level role sync: scanned ${levelRoleSummary.scannedGuilds} guilds, pruned ${levelRoleSummary.prunedRewardEntries} stale rewards, re-awarded ${levelRoleSummary.rolesReAwarded} roles, errors ${levelRoleSummary.errors}`
        );
      }
    } catch (error) {
      logger.error("Error in ready event:", error);
    }
  },
};
