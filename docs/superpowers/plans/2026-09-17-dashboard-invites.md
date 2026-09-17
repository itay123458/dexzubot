# Invite-only public dashboard implementation plan

**Goal:** Let invited Discord accounts use the dashboard without Tailscale, with revocable viewer/manager access.
**Architecture:** Separate public Express listener on container/host port 3002, authenticated before all dashboard routes. Existing private listener stays on 3000/host3001. Tailscale Funnel targets only public listener; private Serve can move to 8443. Reuse registered Discord redirect `https://ik.tailce7102.ts.net/dashboard/`.
**Tech stack:** Express 5, Discord OAuth2 identify, PostgreSQL key/value storage, secure random opaque tokens.

- [x] Auth service: account-bound one-use invitations, hashed tokens, expiry, persistent grants and immediate revocation; bounded ephemeral OAuth states/sessions, secure cookies, strict origin, deny uninvited users. Owner bootstrap via configured bot owner IDs. No OAuth tokens persisted.
- [x] Separate public app: expose dashboard only, no health/root API, validate every API request against invited workspace and current membership; manager requires native Administrator. Use authenticated member for role/staff operations. Never trust identity headers.
- [x] Dashboard access UI: owner-only invite creation/revocation, recipient ID, workspace, viewer/manager, expiry; session/logout/read-only feedback. Reuse existing styles.
- [x] Security checks: invalid/expired/reused invites, wrong account, OAuth state/cookie mismatch/replay, forged headers, cross-origin writes, unauthenticated APIs/assets, viewer mutations, workspace escape, revoked grants, missing configuration/storage. Browser smoke test.
- [ ] Documentation/env/Compose/release notes; local build/audit/checks; validate existing OAuth secret and callback, deploy on Pi after inspection, test listener before Funnel. Verify public denial and private service health, preserve EditIL.

Owner can log in without an invitation solely to bootstrap administration. Invitations grant dashboard access, not Discord permissions. Viewer access includes private dashboard records, explicitly disclosed in UI. Managers need Administrator as the existing control center spans all server settings.

Deployment checkpoint: application deployed at 10f84e3; local/Pi builds, audit,
focused security suites, desktop/mobile UI suites, live HTTPS denials and OAuth
redirect, PostgreSQL invitation creation/list/revocation and bot health passed.
Pi routes 443 to protected port 3002 and private 8443 to port 3001. Tailscale
requires the account owner to enable Funnel before internet publication; that
approval is pending. Beta Discord release publication waits for public access.
