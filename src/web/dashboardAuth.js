import express from 'express';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { PermissionFlagsBits } from 'discord.js';
import { getBotOwners } from '../config/bot.js';
import { readCommunityValue, writeCommunityValue } from '../services/communityBetaService.js';

const STORAGE_KEY = 'dashboard:access:v1';
const SESSION_COOKIE = '__Host-dexzu_session';
const STATE_COOKIE = '__Host-dexzu_oauth';
const STATE_TTL = 10 * 60 * 1000;
const SESSION_TTL = 12 * 60 * 60 * 1000;
const LIMIT = 2000;
const opaque = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
const locks = new WeakMap();
function serialized(client, operation) {
  const previous = locks.get(client) || Promise.resolve();
  const task = previous.then(operation, operation);
  locks.set(client, task.catch(() => {}));
  return task;
}
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(item => item.trim().split('=')).filter(item => item.length === 2));
}
function reject(res, status, error) { return res.status(status).json({ error }); }
function prune(map) { for (const [key, value] of map) if (value.expiresAt <= Date.now()) map.delete(key); }

export function createDashboardAuth(client, { origin = process.env.DASHBOARD_PUBLIC_ORIGIN, clientSecret = process.env.CLIENT_SECRET, ownerIds = getBotOwners(), fetchImpl = fetch } = {}) {
  const router = express.Router();
  const states = new Map(), sessions = new Map();
  let loginWindow = { startedAt: Date.now(), count: 0 };
  const owners = new Set(ownerIds.map(String));
  const clientId = process.env.CLIENT_ID;
  let publicOrigin;
  try { const parsed = new URL(origin); if (parsed.protocol === 'https:' && parsed.origin === origin) publicOrigin = parsed.origin; } catch { /* Invalid configuration fails closed below. */ }
  const configured = () => Boolean(publicOrigin && clientSecret && /^\d{17,20}$/.test(clientId || '') && owners.size);
  async function read() {
    if (!client.db || (process.env.NODE_ENV !== 'test' && client.db.connectionType !== 'postgresql')) throw Error('Persistent storage is unavailable');
    const value = await readCommunityValue(client, STORAGE_KEY);
    if (value === undefined || value === null) return { invites: [], grants: [] };
    if (!Array.isArray(value.invites) || !Array.isArray(value.grants) || value.invites.length > LIMIT || value.grants.length > LIMIT) throw Error('Invalid access storage');
    return structuredClone(value);
  }
  const write = value => writeCommunityValue(client, STORAGE_KEY, value);
  function sameOrigin(req) {
    if (req.dashboardPrivate === true) {
      try { const value = new URL(req.headers.origin); return ['https:', 'http:'].includes(value.protocol) && value.host === req.headers.host && value.origin === req.headers.origin; } catch { return false; }
    }
    return configured() && req.headers.origin === publicOrigin;
  }
  const protectOrigin = (req, res, next) => safeMethods.has(req.method) || sameOrigin(req) ? next() : reject(res, 403, 'This request must come from the dashboard.');
  async function identity(req) {
    if (req.dashboardPrivate === true) return { public: false, owner: true, grants: [] };
    if (!configured()) throw Error('Dashboard login is not configured');
    prune(sessions);
    const session = sessions.get(hash(cookies(req)[SESSION_COOKIE] || ''));
    if (!session) return null;
    const data = await read();
    const owner = owners.has(session.user.id);
    const grants = data.grants.filter(grant => grant.userId === session.user.id);
    if (!owner && !grants.length) return null;
    return { public: true, user: session.user, owner, grants };
  }
  const wrap = handler => async (req, res, next) => { try { await handler(req, res, next); } catch { if (!res.headersSent) reject(res, 503, 'Dashboard access is unavailable. Please try again.'); } };
  const authenticate = wrap(async (req, res, next) => {
    if (!safeMethods.has(req.method) && !sameOrigin(req)) return reject(res, 403, 'This request must come from the dashboard.');
    const auth = await identity(req);
    if (!auth) return req.originalUrl.includes('/api/') || req.originalUrl.includes('/auth/') ? reject(res, 401, 'Sign in with an invited Discord account.') : res.redirect('/dashboard/auth/login');
    req.dashboardAuth = auth;
    req.dashboardUserId = auth.user?.id;
    next();
  });
  const authorizeWorkspace = wrap(async (req, res, next) => {
    if (req.dashboardPrivate === true) return next();
    const auth = await identity(req);
    if (!auth) return reject(res, 401, 'Sign in with an invited Discord account.');
    req.dashboardAuth = auth;
    const workspace = req.query.workspace === undefined ? 'main' : req.query.workspace;
    if (!['main', 'beta'].includes(workspace)) return reject(res, 403, 'This workspace is not available.');
    const grant = auth.grants.find(item => item.workspace === workspace);
    if (!auth.owner && !grant) return reject(res, 403, 'You do not have access to this workspace.');
    let member;
    try { member = await req.dashboardGuild?.members.fetch({ user: auth.user.id, force: true }); } catch { return reject(res, 403, 'Current Discord server membership is required.'); }
    if (!member) return reject(res, 403, 'Current Discord server membership is required.');
    if (!safeMethods.has(req.method) && ((!auth.owner && grant.role !== 'manager') || !member.permissions.has(PermissionFlagsBits.Administrator))) return reject(res, 403, 'Changes require manager access and Discord Administrator permission.');
    req.dashboardMember = member;
    req.dashboardUserId = auth.user.id;
    next();
  });
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });
  router.use(protectOrigin);
  router.use(express.json({ limit: '8kb' }));
  router.get('/session', authenticate, (req, res) => res.json(req.dashboardAuth));
  router.get('/invite', (req, res) => {
    if (!configured()) return reject(res, 503, 'Dashboard login is not configured.');
    if (typeof req.query.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(req.query.token)) return reject(res, 400, 'Invalid invitation.');
    res.redirect(`/dashboard/auth/login?invite=${encodeURIComponent(req.query.token)}`);
  });
  router.get('/login', wrap(async (req, res) => {
    if (!configured()) return reject(res, 503, 'Dashboard login is not configured.');
    const invite = req.query.invite;
    if (invite !== undefined && (typeof invite !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(invite))) return reject(res, 400, 'Invalid invitation.');
    if (Date.now() - loginWindow.startedAt >= 60000) loginWindow = { startedAt: Date.now(), count: 0 };
    if (++loginWindow.count > 60) { res.set('Retry-After', '60'); return reject(res, 429, 'Please try signing in again shortly.'); }
    await read();
    prune(states); if (states.size >= LIMIT) return reject(res, 429, 'Please try signing in again shortly.');
    const state = opaque(), binding = opaque();
    states.set(hash(state), { binding: hash(binding), inviteHash: invite ? hash(invite) : null, expiresAt: Date.now() + STATE_TTL });
    res.cookie(STATE_COOKIE, binding, { ...cookieOptions, maxAge: STATE_TTL });
    const target = new URL('https://discord.com/oauth2/authorize');
    target.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: `${publicOrigin}/dashboard/`, scope: 'identify', state, prompt: 'consent' }).toString();
    res.redirect(target.toString());
  }));
  const callback = wrap(async (req, res, next) => {
    if (!['code', 'state', 'error'].some(key => key in req.query)) return next();
    res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
    if (!configured()) return reject(res, 503, 'Dashboard login is not configured.');
    const state = typeof req.query.state === 'string' ? states.get(hash(req.query.state)) : null;
    if (typeof req.query.state === 'string') states.delete(hash(req.query.state));
    const binding = cookies(req)[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, cookieOptions);
    if (!state || state.expiresAt <= Date.now() || !binding || state.binding !== hash(binding) || req.query.error || typeof req.query.code !== 'string' || req.query.code.length > 2048) return reject(res, 400, 'Sign-in expired or was cancelled. Start again.');
    const tokenResponse = await fetchImpl('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code: req.query.code, redirect_uri: `${publicOrigin}/dashboard/` }), signal: AbortSignal.timeout(10000) });
    if (!tokenResponse.ok) return reject(res, 403, 'Discord sign-in failed.');
    const tokens = await tokenResponse.json();
    if (typeof tokens.access_token !== 'string' || !tokens.access_token) return reject(res, 403, 'Discord sign-in failed.');
    const userResponse = await fetchImpl('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000) });
    if (!userResponse.ok) return reject(res, 403, 'Discord sign-in failed.');
    const user = await userResponse.json();
    if (!/^\d{17,20}$/.test(user.id || '') || typeof user.username !== 'string') return reject(res, 403, 'Discord sign-in failed.');
    const allowed = await serialized(client, async () => {
      const data = await read();
      if (state.inviteHash) {
        const invite = data.invites.find(item => item.tokenHash === state.inviteHash && item.status === 'active' && item.expiresAt > Date.now());
        if (!invite || invite.userId !== user.id) return false;
        if (data.grants.length >= LIMIT) throw Error('Access capacity reached');
        invite.status = 'used'; invite.usedAt = Date.now();
        data.grants = data.grants.filter(item => !(item.userId === user.id && item.workspace === invite.workspace));
        data.grants.push({ id: randomUUID(), userId: user.id, workspace: invite.workspace, role: invite.role, createdAt: Date.now() });
        await write(data);
        return invite.workspace;
      }
      if (owners.has(user.id)) return 'main';
      const grants = data.grants.filter(item => item.userId === user.id);
      return grants.some(item => item.workspace === 'main') ? 'main' : grants[0]?.workspace;
    });
    if (!allowed) return reject(res, 403, 'This account has no valid dashboard invitation.');
    prune(sessions); if (sessions.size >= LIMIT) return reject(res, 429, 'Please try signing in again shortly.');
    const token = opaque();
    sessions.delete(hash(cookies(req)[SESSION_COOKIE] || ''));
    sessions.set(hash(token), { user: { id: user.id, username: user.username }, expiresAt: Date.now() + SESSION_TTL });
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_TTL });
    res.redirect(`${publicOrigin}/dashboard/${allowed === 'beta' ? '?workspace=beta' : ''}`);
  });
  router.post('/logout', (req, res) => { sessions.delete(hash(cookies(req)[SESSION_COOKIE] || '')); res.clearCookie(SESSION_COOKIE, cookieOptions); res.json({ ok: true }); });
  router.use('/access', authenticate, (req, res, next) => req.dashboardAuth.owner ? next() : reject(res, 403, 'Only the bot owner can manage dashboard access.'));
  router.get('/access', wrap(async (_req, res) => {
    const data = await read();
    res.json({ grants: data.grants, invites: data.invites.map(({ tokenHash: _secret, ...item }) => ({ ...item, status: item.status === 'active' && item.expiresAt <= Date.now() ? 'expired' : item.status })) });
  }));
  router.post('/access/invites', wrap(async (req, res) => {
    if (!configured()) return reject(res, 503, 'Dashboard login is not configured.');
    const { userId, workspace, role, hours } = req.body || {};
    if (typeof userId !== 'string' || !/^\d{17,20}$/.test(userId) || !['main', 'beta'].includes(workspace) || !['viewer', 'manager'].includes(role) || !Number.isInteger(hours) || hours < 1 || hours > 168) return reject(res, 400, 'Choose a Discord user ID, workspace, role, and expiry of 1–168 hours.');
    const token = opaque();
    const invite = { id: randomUUID(), userId, workspace, role, createdAt: Date.now(), expiresAt: Date.now() + hours * 3600000, status: 'active' };
    await serialized(client, async () => {
      const data = await read();
      data.invites = data.invites.filter(item => item.status === 'active' && item.expiresAt > Date.now());
      if (data.invites.length >= LIMIT) throw Error('Invitation capacity reached');
      data.invites.push({ ...invite, tokenHash: hash(token) });
      await write(data);
    });
    res.status(201).json({ ...invite, url: `${publicOrigin}/dashboard/auth/invite?token=${token}` });
  }));
  router.post('/access/revoke', wrap(async (req, res) => {
    if (typeof req.body?.id !== 'string') return reject(res, 400, 'An access ID is required.');
    const found = await serialized(client, async () => {
      const data = await read();
      const invite = data.invites.find(item => item.id === req.body.id);
      const grant = data.grants.find(item => item.id === req.body.id);
      if (!invite && !grant) return false;
      if (invite) invite.status = 'revoked';
      if (grant) for (const pending of data.invites) {
        if (pending.userId === grant.userId && pending.workspace === grant.workspace && pending.status === 'active') pending.status = 'revoked';
      }
      data.grants = data.grants.filter(item => item.id !== req.body.id);
      await write(data); return true;
    });
    if (!found) return reject(res, 404, 'Access record not found.');
    res.json({ ok: true });
  }));
  return { router, authenticate, authorizeWorkspace, callback };
}
