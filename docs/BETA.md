# DexzuBot Main and Beta releases

Food collection (/eat), Bible tools (/bible), role management (/role) and
/autorole are released to the configured Main guild and Beta guild. They
retain normal Discord permissions, command switches and guild-separated data.
The existing dashboard controls are available in both workspaces; public
writes still require the saved manager grant and Discord Administrator access.

Commands marked betaOnly or betaSlash stay experimental unless explicitly
marked releasedToMain. Unreleased commands, including /beta, remain owner-only
in Main and do not register globally or in unrelated guilds. Main uses GUILD_ID;
Beta uses BETA_GUILD_ID. Removing Beta configuration does not disable released
Main features. Service guard canUseBetaFeatures is for the released food, Faith
and role services; new experiments must use canUseBetaCommand or isBetaGuild.

This release does not copy Beta configuration, run channel setup, assign roles,
change artwork or enable Main staff activity. Daily Bible delivery remains off
until an administrator explicitly configures it. Existing saved schedules are
preserved. Main and Beta share the running bot process and database infrastructure.
