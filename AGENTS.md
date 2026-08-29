# AGENTS.md

This file provides repository-specific guidance for Codex agents working on
DexzuBot.

## Product identity

- The canonical product name is **DexzuBot**.
- Do not call this bot TitanBot or EditIL Assistant in new user-facing text,
  documentation, release notes, or deployment messages.
- Some inherited internal identifiers may still use `titanbot`. Do not perform a
  broad rename unless the user explicitly requests it.

## Repository and runtime

- Runtime: Node.js 20.10 or newer, ES modules, Discord.js v14.
- Entry point: `src/app.js` (`npm start`).
- Database: PostgreSQL in production, with automatic migrations enabled by the
  Docker Compose deployment.
- Web checks: `GET /health` and `GET /ready` on container port 3000.
- Music: Riffy with Lavalink v4 nodes. Public nodes from `lavalink/nodes.json`
  are used by default; the local Lavalink Compose profile is optional.

Useful commands:

```bash
npm ci
npm start
npm run migrate:check
npm run migrate:status
npm audit --omit=dev
docker compose config --quiet
docker compose build bot
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 bot
```

There is currently no `npm test` script. For source-only changes, run appropriate
focused checks and at minimum validate changed JavaScript with `node --check`.
Do not claim tests passed when no test suite was run.

## Architecture

- Commands: `src/commands/**` (category directories; reusable subcommand logic is
  commonly kept in `modules/`).
- Events: `src/events/**`.
- Buttons, select menus, and modals: `src/interactions/**` and `src/handlers/**`.
- Domain services: `src/services/**`.
- Database wrapper and PostgreSQL implementation: `src/utils/database.js`,
  `src/utils/database/**`, and `src/utils/postgresDatabase.js`.
- Runtime configuration: `src/config/**`.
- Database maintenance scripts: `scripts/**`.

Preserve the existing interaction helpers, permission guards, response
coordination, validation, and service error boundaries when adding features.
Avoid bypassing these shared layers with one-off command behavior.

## Secrets and data safety

- Never print, commit, transmit, or include the contents of `.env` in logs or
  responses.
- Never place Discord tokens, database passwords, API keys, private SSH keys, or
  other credentials in `AGENTS.md` or tracked files.
- `.env` is ignored by Git. Use `.env.example` only for documented placeholders.
- DexzuBot must use its own Discord application/token and PostgreSQL data. Never
  reuse EditIL Assistant credentials or database storage.
- Treat PostgreSQL volumes and backups as permanent user data. Never run
  `docker compose down --volumes`, delete a volume, or restore a backup without
  explicit user authorization and a verified target.

## Raspberry Pi deployment

Read `DEPLOYMENT-PI.md` before changing or deploying the Pi configuration.

DexzuBot runs beside the existing **EditIL Assistant** bot. Preserve this
isolation:

- Compose project name: `dexzubot`.
- Pi install directory: `/opt/dexzubot`.
- Generated containers use the `dexzubot-` prefix; do not add inherited fixed
  `titanbot` container names.
- Default host health port: loopback-only `127.0.0.1:3001` mapped to container
  port 3000.
- PostgreSQL uses the Compose project-scoped `postgres_data` volume.
- Do not enable the `local-lavalink` profile until Pi memory and architecture
  have been checked. The default deployment uses configured public nodes.
- Before deploying, inspect the running containers, port 3001, free memory, and
  free disk. Do not stop, rebuild, or modify the EditIL Assistant stack.

The workstation has a dedicated Pi SSH key at
`$env:USERPROFILE\.ssh\id_ed25519_editil_pi`. The Pi user is `ik`. The Pi address
may change and must be rediscovered or confirmed rather than hard-coded. Never
display or copy the private key contents.

## Deployment workflow

Only deploy when the Pi is reachable and the user requested deployment or the
current task explicitly includes it.

1. Confirm the local branch is correct and inspect uncommitted changes.
2. Run checks proportionate to the change. For deployment-related changes, run
   at least:

   ```bash
   npm audit --omit=dev
   docker compose config --quiet
   docker compose build bot
   ```

3. Commit only files belonging to the task. Preserve unrelated user changes.
4. Push the intended branch so the Pi can update with `git pull --ff-only`.
5. On the Pi, inspect the old and new stacks before changing anything.
6. Update `/opt/dexzubot`, then run `docker compose up -d --build` from that
   directory.
7. Verify `docker compose ps`, recent bot logs, PostgreSQL health, and
   `curl --fail http://127.0.0.1:3001/health` (or the configured host port).
8. Confirm EditIL Assistant is still running and healthy after deployment.

If the Pi is offline, prepare and validate changes locally, push them if needed
for the requested workflow, and clearly report that remote deployment remains
pending. Do not treat an unreachable Pi as permission to change the old bot's
local repository or deployment configuration.

## Git and change discipline

- Preserve unrelated changes in a dirty worktree.
- Do not use destructive Git commands such as `git reset --hard` or overwrite
  user changes.
- Do not commit `.env`, logs, backups, generated runtime data, or database dumps.
- Keep deployment documentation aligned with `docker-compose.yml` and
  `.env.example` whenever ports, required variables, services, or paths change.
- Report the commit, branch, validations performed, local build result, and
  deployment health when applicable.
