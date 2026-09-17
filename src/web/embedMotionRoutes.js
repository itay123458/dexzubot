import { isBetaGuild } from '../config/beta.js';
import { embedMotionState, saveEmbedMotion } from '../services/embedMotionService.js';
import { refreshConfiguredPanelDesigns } from '../services/panelDesignService.js';
import { Mutex } from '../utils/mutex.js';

export function registerEmbedMotionRoutes(router, client) {
  const beta = (req, res, next) => isBetaGuild(req.dashboardGuild.id) ? next() : res.status(403).json({ error: 'Animated messages are available only in Beta.' });
  router.get('/embed-motion', beta, (req, res) => res.json(embedMotionState(req.dashboardGuild.id)));
  router.post('/embed-motion', beta, async (req, res, next) => {
    if (typeof req.body?.enabled !== 'boolean' || Object.keys(req.body).length !== 1) return res.status(400).json({ error: 'Choose whether message animation is enabled.' });
    try {
      const result = await Mutex.runExclusive(`embed-motion:${req.dashboardGuild.id}`, async () => {
        const state = await saveEmbedMotion(client, req.dashboardGuild.id, req.body.enabled);
        const panels = await refreshConfiguredPanelDesigns(client, req.dashboardGuild.id);
        return { ...state, panels };
      });
      res.json(result);
    } catch (error) { next(error); }
  });
}
