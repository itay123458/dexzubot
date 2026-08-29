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
