import { isCommunityGuild } from '../config/community.js';
import { embedMotionState, saveEmbedMotion } from '../services/embedMotionService.js';
import { refreshConfiguredPanelDesigns } from '../services/panelDesignService.js';
import { Mutex } from '../utils/mutex.js';
import { refreshPublishedCommunityPanels } from '../services/communityBetaPanels.js';

export function registerEmbedMotionRoutes(router, client) {
  const beta = (req, res, next) => isCommunityGuild(req.dashboardGuild.id) ? next() : res.status(403).json({ error: 'Animated messages are available in the configured workspaces.' });
  router.get('/embed-motion', beta, (req, res) => res.json(embedMotionState(req.dashboardGuild.id)));
  router.post('/embed-motion', beta, async (req, res, next) => {
    if (typeof req.body?.enabled !== 'boolean' || Object.keys(req.body).length !== 1) return res.status(400).json({ error: 'Choose whether message animation is enabled.' });
    try {
      const result = await Mutex.runExclusive(`embed-motion:${req.dashboardGuild.id}`, async () => {
        const state = await saveEmbedMotion(client, req.dashboardGuild.id, req.body.enabled);
        const panels = await refreshConfiguredPanelDesigns(client, req.dashboardGuild.id);
        const community = await refreshPublishedCommunityPanels(client, req.dashboardGuild);
        panels.refreshed += community.refreshed;panels.errors += community.errors;
        return { ...state, panels };
      });
      res.json(result);
    } catch (error) { next(error); }
  });
}
