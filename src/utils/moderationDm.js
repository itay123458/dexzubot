import { logger } from './logger.js';

export async function sendModerationReasonDm({ user, guild, action, reason, duration = null, inviteUrl = null, availableAt = null }) {
  if (!reason) return false;

  const lines = [
    `A moderation action was taken against you in **${guild.name}**.`,
    `**Action:** ${action}`,
    duration ? `**Duration:** ${duration}` : null,
    `**Reason:** ${reason}`,
    inviteUrl ? '**Return invite:** Save this one-use link. It will work after your timed ban expires.' : null,
    inviteUrl && availableAt ? `You can return <t:${Math.floor(new Date(availableAt).getTime() / 1000)}:R>.` : null,
    inviteUrl,
  ].filter(Boolean);

  try {
    await user.send({ content: lines.join('\n') });
    return true;
  } catch (error) {
    logger.debug(`Could not DM moderation reason to ${user.id}: ${error.message}`);
    return false;
  }
}
