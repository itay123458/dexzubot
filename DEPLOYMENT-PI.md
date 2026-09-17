# Raspberry Pi deployment

This Compose stack is isolated from the existing EditIL Assistant deployment:

- Compose project: `dexzubot`
- Containers: generated with the `dexzubot-` prefix
- Database: a project-scoped PostgreSQL volume
- Health endpoint: Pi loopback port `3001` by default
- Discord identity: a separate application/token is required

The bot and PostgreSQL images support the Pi's usual ARM64 platform. The optional
local Lavalink service is not enabled by the commands below; the bot uses the
configured public Lavalink nodes by default.

## First deployment

From the workstation, connect using the existing Pi SSH key:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519_editil_pi" ik@PI_ADDRESS
```

On the Pi:

```bash
sudo mkdir -p /opt/dexzubot
sudo chown "$USER":"$USER" /opt/dexzubot
git clone https://github.com/itay123458/dexzubot.git /opt/dexzubot
cd /opt/dexzubot
cp .env.example .env
nano .env
```

Set at least these values in `.env`:

```dotenv
DISCORD_TOKEN=token_for_the_new_discord_application
CLIENT_ID=application_id_for_the_new_bot
GUILD_ID=discord_server_id
POSTGRES_USER=dexzubot
POSTGRES_DB=dexzubot
POSTGRES_PASSWORD=a_long_unique_random_password
BOT_HOST_PORT=3001
```

Never reuse the old bot's Discord token or database password. Keep `.env` only on
the Pi; it is ignored by Git.

Validate and start the isolated stack:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3001/health
docker compose logs --tail=100 bot
```

Do not use the `local-lavalink` profile initially. It adds another Java service
and significantly increases memory usage.

## Updating

### Beta guild on the existing bot

`GUILD_ID` remains the production server. Set `BETA_GUILD_ID` in the Pi's private
`.env` to register an additional beta guild with its own saved guild settings.
Mark experimental commands `betaOnly: true`; registration, execution, and help
exclude them outside the beta guild. Use `isBetaGuild(guildId)` from
`src/config/beta.js` to gate experimental behavior inside an existing feature.
Shared backend changes still run in the same process; this is not deployment
or crash isolation. The private dashboard has Main and Beta workspaces:
`/dashboard/` manages `GUILD_ID`, while `/dashboard/?workspace=beta` manages
`BETA_GUILD_ID`. Every API request, activity feed, and configuration download
uses the selected workspace. Missing configured servers fail closed. Switching
loads a fresh page and warns about unsaved edits; separate tabs keep their own
server selection. Experimental website features still need an explicit beta
view/feature gate; the shared dashboard code is not a separate deployment.

The user-approved test server is `1486680755869323388`. Its repeatable layout
setup is `scripts/setup-beta-server.mjs` (preview by default, `--apply` to write).
Before applying, save `--snapshot` output to a private file under the host's
`/opt/dexzubot/backups` directory. Copy the setup's generated layout/config
backups from the container to that host directory before a later rebuild.
The script preserves existing channels, messages, roles, private ticket
overwrites, and counters. It only targets the approved beta server and refuses
to run if that server is configured as `GUILD_ID`.

```bash
cd /opt/dexzubot
git pull --ff-only
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:3001/health
```

## Operations

```bash
cd /opt/dexzubot
docker compose logs -f bot
docker compose restart bot
docker compose stop
docker compose start
```

## Private control dashboard

The bot serves its control dashboard at `http://127.0.0.1:3001/dashboard/` on
the Pi. Keep this host port loopback-only. Use Tailscale Serve (not Funnel) to
provide private HTTPS access to approved tailnet users:

```bash
sudo tailscale serve --bg http://127.0.0.1:3001
```

Do not expose port 3001 on the LAN or public internet. The default dashboard is
private. For the separately authenticated public dashboard, follow the section
below; Funnel must never target port 3001.

## Invite-only public dashboard

The public dashboard is a separate Express listener on container port 3002,
published only to `127.0.0.1:3002` on the Pi. It has no health, ready, or other
bot API routes. Every dashboard API request checks the signed-in Discord
account, its saved grant, and current server membership. Writes additionally
require manager access and native Discord Administrator permission. Role and
staff operations use the signed-in member's identity and permission checks.

Configure these values in the Pi's private `.env`:

```dotenv
DASHBOARD_PUBLIC_ENABLED=true
DASHBOARD_PUBLIC_ORIGIN=https://YOUR-PI.YOUR-TAILNET.ts.net
DASHBOARD_PUBLIC_HOST_PORT=3002
CLIENT_SECRET=YOUR_DEXZUBOT_OAUTH_CLIENT_SECRET
```

Use the existing DexzuBot application's OAuth secret, not its bot token or
another application's credentials. Register the exact redirect URI
`https://YOUR-PI.YOUR-TAILNET.ts.net/dashboard/` in Discord's Developer Portal.
The current installation already registered this URI on its existing host.
The origin must be HTTPS, with no trailing slash, path, query, or fragment.
Configured bot owner IDs can sign in without an invite to administer access.

Before enabling Funnel, run the auth and public-listener checks and verify
unauthenticated requests to port 3002 cannot read dashboard APIs or assets.
Then preserve the old administrative surface as private Serve on port 8443
and route public HTTPS only to the authenticated listener:

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:3001
tailscale funnel --bg --https=443 http://127.0.0.1:3002
tailscale serve status
tailscale funnel status
```

Inspect existing Serve/Funnel configuration before changing routes. Preserve
unrelated services. If an existing 443 Serve route must be removed first,
remove only that route after confirming private 8443 works. Funnel availability
depends on the tailnet's policy; do not relax broader tailnet access policies.

The private dashboard at `https://YOUR-PI.YOUR-TAILNET.ts.net:8443/dashboard/`
retains the trusted administrative access model and remains tailnet-only.
The public URL on 443 requires Discord login. Never use request headers to
grant private access or trust a caller-supplied Discord identity.

Under **Operations → Dashboard access**, the owner enters a recipient's
Discord ID, Main/Beta workspace, viewer/manager role, and 1–168 hour invite
expiry. The link is displayed once and stored only as a hash. It is single-use
and bound to that account. Viewer access includes private staff records;
invite only people allowed to read them. Accepted grants last until revoked;
revoking a grant also cancels outstanding invitations for that account and
workspace. Sessions expire after 12 hours or a bot restart. Every request
rechecks grants, so revocation takes effect without waiting for session expiry.

OAuth state and sessions use bounded in-memory stores and secure, HttpOnly,
SameSite=Lax cookies. Grants and invitations require PostgreSQL; storage
failures deny access. OAuth access tokens are used only to identify the user
and are never stored. A global sign-in rate limit may temporarily reject
logins during flooding. No new paid hosting or open router ports are needed.

`docker compose down` removes containers and the private network but preserves the
database volume. Do not add `--volumes` unless permanent bot data should be deleted.

## Pre-deployment checks

Before the first start, verify that the existing bot is healthy and that port 3001
is unused:

```bash
docker ps
ss -ltn | grep ':3001 ' || true
free -h
df -h /
```

If port 3001 is already occupied, change `BOT_HOST_PORT` in `.env` and use the same
port for the health check.
