import { isBetaGuild } from '../config/beta.js';
import { getFoodDashboardState, saveFoodSettings } from '../services/foodCollectionService.js';

export function registerFoodRoutes(router, client) {
  const handled = action => async (req, res, next) => {
    if (!isBetaGuild(req.dashboardGuild.id)) return res.status(403).json({ error: 'Food collection is available in Beta first.' });
    try { await action(req, res); }
    catch (error) {
      if (error.name === 'ZodError') return res.status(400).json({ error: 'Choose enabled or disabled and a cooldown from 5 to 3600 whole seconds.' });
      next(error);
    }
  };
  router.get('/food', handled(async (req, res) => res.json(await getFoodDashboardState(client, req.dashboardGuild.id))));
  router.post('/food', handled(async (req, res) => res.json({ ok: true, settings: await saveFoodSettings(client, req.dashboardGuild.id, req.body) })));
}
