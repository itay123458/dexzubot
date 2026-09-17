# Invite-only public dashboard implementation plan

**Goal:** Let invited Discord accounts use the dashboard without Tailscale, with revocable viewer/manager access.
**Architecture:** Separate public Express listener on container/host port 3002, authenticated before all dashboard routes. Existing private listener stays on 3000/host3001. Tailscale Funnel targets only public listener; private Serve can move to 8443. Reuse registered Discord redirect `https://ik.tailce7102.ts.net/dashboard/`.
**Tech stack:** Express 5, Discord OAuth2 identify, PostgreSQL key/value storage, secure random opaque tokens.

- [ ] Auth service: account-bound one-use invitations, hashed tokens, expiry, persistent grants and immediate revocation; bounded ephemeral OAuth states/sessions, secure cookies, strict origin, deny uninvited users. Owner bootstrap via configured bot owner IDs. No OAuth tokens persisted.
- [ ] Separate public app: expose dashboard only, no health/root API, validate every API request against invited workspace and current membership; manager requires native Administrator. Use authenticated member for role/staff operations. Never trust identity headers.
- [ ] Dashboard access UI: owner-only invite creation/revocation, recipient ID, workspace, viewer/manager, expiry; session/logout/read-only feedback. Reuse existing styles.
- [ ] Security checks: invalid/expired/reused invites, wrong account, OAuth state/cookie mismatch/replay, forged headers, cross-origin writes, unauthenticated APIs/assets, viewer mutations, workspace escape, revoked grants, missing configuration/storage. Browser smoke test.
- [ ] Documentation/env/Compose/release notes; local build/audit/checks; validate existing OAuth secret and callback, deploy on Pi after inspection, test listener before Funnel. Verify public denial and private service health, preserve EditIL.

Owner can log in without an invitation solely to bootstrap administration. Invitations grant dashboard access, not Discord permissions. Viewer access includes private dashboard records, explicitly disclosed in UI. Managers need Administrator as the existing control center spans all server settings.
