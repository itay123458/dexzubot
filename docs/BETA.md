# DexzuBot beta server

Set `BETA_GUILD_ID` to the beta Discord server ID and invite the existing
DexzuBot application to that server. Leave it empty to disable beta access.
The Compose `env_file` passes this setting to the bot. Restart/redeploy after
changing it so slash command registration is refreshed.

Startup retains the main server registration and registers commands for the
beta server using that server's own configuration. `/beta` reports the testing
scope. No experimental features are enabled by this setup alone.

Mark a future command with `betaOnly: true` to exclude it from global and
non-beta guild registration, help listings, slash execution, autocomplete, and
prefix execution. Existing permission and command-availability checks remain
in force. An unset or invalid beta ID denies beta-only commands everywhere.

This is the same bot application, process, and database infrastructure as the
main server. It does not isolate crashes, process-wide changes, or database
migrations. Server settings and supported data remain keyed by guild ID. Any
future beta background task or component handler must also check
`isBetaGuild(guildId)` before performing its work; the command marker guards
command entry points, not arbitrary background code.

If the beta server ID changes or is removed, old guild command definitions can
remain visible until that guild's registration is refreshed. Runtime guards
still deny their execution outside the currently configured beta server.
