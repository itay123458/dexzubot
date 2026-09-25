# DexzuBot beta server

Set `BETA_GUILD_ID` to the beta Discord server ID and invite the existing
DexzuBot application to that server. Leave it empty to disable beta access.
The Compose `env_file` passes this setting to the bot. Restart/redeploy after
changing it so slash command registration is refreshed.

Startup retains the main server registration and registers commands for the
beta server using that server's own configuration. `/beta` reports the testing
scope. No experimental features are enabled by this setup alone.

Commands marked `betaOnly: true` register in Beta and the configured Main
guild (`GUILD_ID`), but never globally or in unrelated guilds. In Main, only
configured `OWNER_IDS` can execute them, receive autocomplete results or see
them in bot-generated help. Discord may still display registered commands to
other members; runtime authorization rejects them, including administrators
and the Discord server owner. Existing permission and command-availability
checks remain in force. An unset or invalid beta ID denies beta-only commands
everywhere. `betaSlash` commands use this owner gate for Main slash invocation;
their existing stable prefix access is unchanged.

Trusted Discord entry points establish an asynchronous access scope from the
actual user and guild. Food, Faith and role service guards use it, including
buttons clicked on another member's message. HTTP dashboard routes remain
Beta-only and cannot obtain this exception through body fields or headers.
Main data stays keyed to Main. An owner-created Main Bible schedule records
the authorizing owner ID; background delivery rechecks that it is still a
configured owner. No Main schedule is enabled by deployment alone.

This is the same bot application, process, and database infrastructure as the
main server. It does not isolate crashes, process-wide changes, or database
migrations. Server settings and supported data remain keyed by guild ID. Any
future Beta component handler must call a service guard using
`canUseBetaFeatures(guildId)` inside the trusted interaction scope. Background
tasks require explicit persisted owner authorization for Main, or remain
restricted with `isBetaGuild(guildId)`; command access is not blanket background
authorization.

If the beta server ID changes or is removed, old guild command definitions can
remain visible until that guild's registration is refreshed. Runtime guards
still deny execution except in the currently configured Beta server or for a
configured bot owner in Main.
