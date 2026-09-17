import express from 'express';
import { registerDashboard } from './dashboard.js';

// A separate listener ensures Funnel can never reach the trusted private app,
// its health endpoints, or the bot's other HTTP routes.
export function createPublicDashboard(client, auth, origin) {
  const expected = new URL(origin);
  if (expected.protocol !== 'https:' || expected.username || expected.password || expected.pathname !== '/' || expected.search || expected.hash) {
    throw new Error('DASHBOARD_PUBLIC_ORIGIN must be an HTTPS origin.');
  }
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  let windowStart = Date.now(), requests = 0;
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
    if (req.get('host') !== expected.host) return res.status(400).send('Invalid dashboard host.');
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) return res.sendStatus(405);
    if (req.method === 'POST' && req.get('origin') !== expected.origin) return res.status(403).json({ error: 'Open the dashboard before submitting changes.' });
    if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0; }
    if (++requests > 3000) return res.set('Retry-After', '60').sendStatus(429);
    next();
  });
  app.get('/', (req, res) => res.redirect('/dashboard/'));
  app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /\n'));
  app.get('/dashboard/', auth.callback);
  app.use('/dashboard/auth', auth.router);
  app.use('/dashboard', auth.authenticate);
  registerDashboard(app, client, { authorizeWorkspace: auth.authorizeWorkspace });
  app.use((req, res) => res.sendStatus(404));
  app.use((error, req, res, next) => {
    // Never include OAuth codes, session tokens or database details in responses.
    if (res.headersSent) return next(error);
    res.status(503).json({ error: 'Dashboard unavailable. Please try again shortly.' });
  });
  return app;
}
