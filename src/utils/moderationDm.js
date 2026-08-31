import { logger } from './logger.js';

export async function sendModerationReasonDm({ user, guild, action, reason, duration = null }) {
  if (!reason) return false;

  const lines = [
    `A moderation action was taken against you in **${guild.name}**.`,
    `**Action:** ${action}`,
    duration ? `**Duration:** ${duration}` : null,
    `**Reason:** ${reason}`,
  ].filter(Boolean);

  try {
    await user.send({ content: lines.join('\n') });
    return true;
  } catch (error) {
    logger.debug(`Could not DM moderation reason to ${user.id}: ${error.message}`);
    return false;
  }
}
