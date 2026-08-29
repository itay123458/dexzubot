import { Events } from 'discord.js';
import config from '../config/application.js';
import { applyMirroredPresence } from '../services/presenceMirrorService.js';

export default {
  name: Events.PresenceUpdate,
  async execute(_oldPresence, newPresence, client) {
    if (newPresence?.userId !== config.bot.presence.mirrorUserId) {
      return;
    }

    applyMirroredPresence(client, newPresence);
  },
};
