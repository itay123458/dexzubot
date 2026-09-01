// moderationService.js

import { PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, ErrorTypes } from '../../utils/errorHandler.js';
import { logModerationAction } from '../../utils/moderation.js';
import { markBotModerationAction } from '../loggingService.js';
import { formatModerationDuration } from '../../utils/moderationDuration.js';
import { scheduleTimedSoftban } from './timedSoftbanService.js';

function getTargetLabel(target) {
  return target.user?.tag ?? target.displayName ?? 'this user';
}

function getHighestRole(member) {
  return member?.roles?.highest ?? null;
}

export class ModerationService {

  static buildHierarchyMessage({ actor, actorRole, targetRole, targetLabel, action }) {
    if (actor === 'moderator') {
      return (
        `You cannot ${action} **${targetLabel}** — their role **${targetRole.name}** is equal to or above yours (**${actorRole.name}**). ` +
        `In **Server Settings → Roles**, drag your moderator role above **${targetRole.name}**.`
      );
    }

    return (
      `I cannot ${action} **${targetLabel}** — my role **${actorRole.name}** is equal to or below theirs (**${targetRole.name}**). ` +
      `In **Server Settings → Roles**, drag my bot role above **${targetRole.name}**.`
    );
  }

  static buildHierarchySkipReason(moderator, target, action, actor = 'moderator') {
    const targetLabel = getTargetLabel(target);
    const targetRole = getHighestRole(target);

    if (actor === 'bot') {
      const botMember = target.guild?.members?.me;
      const botRole = getHighestRole(botMember);
      if (!botRole || !targetRole) {
        return `Bot role hierarchy blocked ${action} for ${targetLabel}`;
      }
      return `Bot role **${botRole.name}** is too low for **${targetRole.name}** — move the bot role higher`;
    }

    const modRole = getHighestRole(moderator);
    if (!modRole || !targetRole) {
      return `Role hierarchy blocked ${action} for ${targetLabel}`;
    }
    return `Your role **${modRole.name}** is too low for **${targetRole.name}** — move your role higher`;
  }

  static validateHierarchy(moderator, target, action) {
    if (!moderator || !target) {
      return { valid: false, error: 'Invalid moderator or target' };
    }

    if (moderator.guild?.ownerId === moderator.id) {
      return { valid: true };
    }

    const modRole = getHighestRole(moderator);
    const targetRole = getHighestRole(target);

    if (!modRole || !targetRole) {
      return {
        valid: false,
        error: 'Could not resolve role hierarchy. Try mentioning the user or use the slash command.',
      };
    }

    if (modRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'moderator',
          actorRole: modRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static validateBotHierarchy(target, action) {
    if (!target) {
      return { valid: false, error: 'Invalid target' };
    }

    const botMember = target.guild?.members?.me;
    if (!botMember) {
      return { valid: false, error: 'Bot is not in the guild' };
    }

    const botRole = getHighestRole(botMember);
    const targetRole = getHighestRole(target);

    if (!botRole || !targetRole) {
      return {
        valid: false,
        error: 'Could not resolve bot role hierarchy. Check that my role is configured in this server.',
      };
    }

    if (botRole.position <= targetRole.position) {
      return {
        valid: false,
        error: this.buildHierarchyMessage({
          actor: 'bot',
          actorRole: botRole,
          targetRole,
          targetLabel: getTargetLabel(target),
          action,
        }),
      };
    }

    return { valid: true };
  }

  static assertModerationHierarchy(moderator, target, action) {
    const botCheck = this.validateBotHierarchy(target, action);
    if (!botCheck.valid) {
      throw new TitanBotError(botCheck.error, ErrorTypes.PERMISSION, botCheck.error);
    }

    const modCheck = this.validateHierarchy(moderator, target, action);
    if (!modCheck.valid) {
      throw new TitanBotError(modCheck.error, ErrorTypes.PERMISSION, modCheck.error);
    }
  }

  static async banUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided',
    deleteDays = 0
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, user, and moderator are required'
        );
      }

      let targetMember = null;
      try {
        targetMember = await guild.members.fetch(user.id).catch(() => null);
      } catch (err) {
        logger.debug('Target not in guild, proceeding with ban');
      }

      if (targetMember) {
        this.assertModerationHierarchy(moderator, targetMember, 'ban');
      } else {

        const isOwner = guild.ownerId === moderator.id;
        const hasHighPerms = moderator.permissions.has([
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.Administrator
        ]);

        if (!isOwner && !hasHighPerms) {
            throw new TitanBotError(
                'You do not have sufficient permissions to ban users who are not in the server.',
                ErrorTypes.PERMISSION,
                'You need "Manage Server" or "Administrator" permissions to ban users not currently in the guild.'
            );
        }
      }

      markBotModerationAction(guild.id, 'ban', user.id);
      await guild.members.ban(user.id, { reason });

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Banned',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id,
            permanent: true,
            deleteDays
          }
        }
      });

      logger.info(`User banned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error banning user:', error);
      throw error;
    }
  }

  static async kickUser({
    guild,
    member,
    moderator,
    reason = 'No reason provided'
  }) {
    try {
      if (!guild || !member || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, and moderator are required'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'kick');

      if (!member.kickable) {
        const targetLabel = getTargetLabel(member);
        throw new TitanBotError(
          'Cannot kick member',
          ErrorTypes.PERMISSION,
          `I cannot kick **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. ` +
          'Ensure my bot role is above theirs in **Server Settings → Roles** and that they do not have Admin.'
        );
      }

      markBotModerationAction(guild.id, 'kick', member.id);
      await member.kick(reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Kicked',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`User kicked: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: member.user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error kicking user:', error);
      throw error;
    }
  }

  static async softbanUser({
    guild,
    member,
    moderator,
    durationMs,
    inviteChannelId,
    reason = 'No reason provided',
    beforeAction = null
  }) {
    try {
      if (!guild || !member || !moderator || !durationMs || !inviteChannelId) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, moderator, duration, and invite channel are required'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'softban');
      if (!member.bannable) {
        throw new TitanBotError(
          'Cannot softban member',
          ErrorTypes.PERMISSION,
          `I cannot softban **${getTargetLabel(member)}**. Check my Ban Members permission and role position.`
        );
      }

      const expiresAt = new Date(Date.now() + durationMs).toISOString();
      const inviteChannel = await guild.channels.fetch(inviteChannelId).catch(() => null);
      if (!inviteChannel?.createInvite) {
        throw new TitanBotError('Invite channel unavailable', ErrorTypes.PERMISSION, 'I could not access the channel selected for the return invite.');
      }
      const invite = await inviteChannel.createInvite({
        maxAge: 0,
        maxUses: 1,
        unique: true,
        reason: `Return invite for timed softban of ${member.id}`,
      });

      const dmSent = beforeAction ? await beforeAction({ inviteUrl: invite.url, expiresAt }) : false;
      if (!dmSent) {
        await invite.delete('Timed softban cancelled because the return invite DM failed').catch(() => {});
        throw new TitanBotError(
          'Return invite DM failed',
          ErrorTypes.UNKNOWN,
          `I could not DM **${getTargetLabel(member)}** their return invite, so the timed softban was not applied. Ask them to enable direct messages and try again.`
        );
      }

      markBotModerationAction(guild.id, 'ban', member.id);
      try {
        await guild.members.ban(member.id, { deleteMessageSeconds: 7 * 24 * 60 * 60, reason });
      } catch (error) {
        await invite.delete('Timed softban failed before the ban was applied').catch(() => {});
        throw error;
      }

      try {
        await scheduleTimedSoftban(guild.client, {
          guildId: guild.id,
          userId: member.id,
          moderatorId: moderator.id,
          reason,
          inviteChannelId,
          inviteUrl: invite.url,
          createdAt: new Date().toISOString(),
          expiresAt,
        });
      } catch (error) {
        markBotModerationAction(guild.id, 'unban', member.id);
        await guild.members.unban(member.id, 'Timed softban scheduling failed; reverting ban').catch(() => {});
        await invite.delete('Timed softban scheduling failed').catch(() => {});
        throw new TitanBotError(
          `Softban scheduling failed: ${error.message}`,
          ErrorTypes.UNKNOWN,
          'I could not save the timed ban, so the ban was reverted. Please try again.'
        );
      }

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Softbanned',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id,
            deletedMessageDays: 7,
            durationMs,
            expiresAt
          }
        }
      });

      logger.info(`User softbanned: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      return { caseId, user: member.user.tag, reason, durationMs, dmSent };
    } catch (error) {
      logger.error('Error softbanning user:', error);
      throw error;
    }
  }

  static async timeoutUser({
    guild,
    member,
    moderator,
    durationMs,
    reason = 'No reason provided',
    beforeAction = null
  }) {
    try {
      if (!guild || !member || !moderator || !durationMs) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, moderator, and duration are required'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'timeout');

      if (!member.moderatable) {
        const targetLabel = getTargetLabel(member);
        throw new TitanBotError(
          'Cannot timeout member',
          ErrorTypes.PERMISSION,
          `I cannot timeout **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. ` +
          'Ensure my bot role is above theirs in **Server Settings → Roles** and that they do not have Admin.'
        );
      }

      const dmSent = beforeAction ? await beforeAction() : null;

      markBotModerationAction(guild.id, 'timeout', member.id);
      await member.timeout(durationMs, reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Timed Out',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          duration: formatModerationDuration(durationMs),
          metadata: {
            userId: member.id,
            moderatorId: moderator.id,
            durationMs
          }
        }
      });

      logger.info(`User timed out: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: member.user.tag,
        durationMs,
        dmSent,
        reason
      };
    } catch (error) {
      logger.error('Error timing out user:', error);
      throw error;
    }
  }

  static async removeTimeoutUser({
    guild,
    member,
    moderator,
    reason = 'Timeout removed by moderator'
  }) {
    try {
      if (!guild || !member || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, member, and moderator are required'
        );
      }

      this.assertModerationHierarchy(moderator, member, 'remove the timeout from');

      if (!member.moderatable) {
        const targetLabel = getTargetLabel(member);
        throw new TitanBotError(
          'Cannot modify member',
          ErrorTypes.PERMISSION,
          `I cannot modify **${targetLabel}**. They may have **Administrator** permission or a managed/integration role. ` +
          'Ensure my bot role is above theirs in **Server Settings → Roles**.'
        );
      }

      if (!member.isCommunicationDisabled()) {
        throw new TitanBotError(
          'User not timed out',
          ErrorTypes.VALIDATION,
          `${member.user.tag} is not currently timed out`
        );
      }

      markBotModerationAction(guild.id, 'untimeout', member.id);
      await member.timeout(null, reason);

      await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Untimeouted',
          target: `${member.user.tag} (${member.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: member.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`Timeout removed: ${member.user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        user: member.user.tag
      };
    } catch (error) {
      logger.error('Error removing timeout:', error);
      throw error;
    }
  }

  static async unbanUser({
    guild,
    user,
    moderator,
    reason = 'No reason provided'
  }) {
    try {
      if (!guild || !user || !moderator) {
        throw new TitanBotError(
          'Missing required parameters',
          ErrorTypes.VALIDATION,
          'Guild, user, and moderator are required'
        );
      }

      const bans = await guild.bans.fetch();
      const banInfo = bans.get(user.id);

      if (!banInfo) {
        throw new TitanBotError(
          'User not banned',
          ErrorTypes.VALIDATION,
          `${user.tag} is not currently banned from this server`
        );
      }

      markBotModerationAction(guild.id, 'unban', user.id);
      await guild.members.unban(user.id, reason);

      const caseId = await logModerationAction({
        client: guild.client,
        guild,
        event: {
          action: 'Member Unbanned',
          target: `${user.tag} (${user.id})`,
          executor: `${moderator.user.tag} (${moderator.id})`,
          reason,
          metadata: {
            userId: user.id,
            moderatorId: moderator.id
          }
        }
      });

      logger.info(`User unbanned: ${user.tag} by ${moderator.user.tag} in ${guild.name}`);
      
      return {
        caseId,
        user: user.tag,
        reason
      };
    } catch (error) {
      logger.error('Error unbanning user:', error);
      throw error;
    }
  }
}
