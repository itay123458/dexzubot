# Community tools release — 17 September 2026

Community tools and message animation are released to the configured main and
beta guilds. Settings, applications, leave requests, activity checks, invite
ledgers and wallet balances remain guild-specific. Unknown guilds are rejected.
Existing storage keys and button IDs stay unchanged so old messages still work.

Use `/staff`, `/community guide`, and `/invite-rewards`, or Dashboard → Operations
→ Community tools. Existing `/beta-staff` and `/community-beta` names remain aliases.
Other experiments, including beta role-management controls, retain their own gates.

Report tickets collect a member, incident, optional evidence and extra details.
Partnership tickets collect community name, link, size, proposed partnership and
optional extra information. Full form text is saved and attached to the private
ticket; the embed shows compact previews. Previously opened reason-only forms
remain valid.

Applications offer staff and partnership-manager tracks. One active application
per member uses one persistent progress card. Staff questions are configurable;
the partnership track snapshots its own questions. Reviews show the track and
full answers in the private dashboard. The optional HTTPS application website
setting adds an Apply via Website button; it never links members to the admin
dashboard by default.

Animated application emoji arrows and existing Dexzu GIF artwork decorate panels.
Discord controls playback, including reduced-motion behavior in its own client.
The dashboard message-animation switch affects only the selected guild and
refreshes its published community panels. Text and modal controls do not animate.

Release workflow: build/check; install `scripts/install-community-arrow.mjs
--guild=<configured guild ID>`; run `scripts/release-community.mjs prepare` with
the persistent backups mount; restart the bot; run `panels`, verify, then `announce`.
Preparation preserves existing channels, role assignments, settings on reruns,
and ticket configuration. It creates only missing panel/review channels and
backs up configuration before mutation. The main staff role is Mod and the
reviewer role is Trusted Mod; native Manage Server access is also respected.
Main and Beta announcements are compact Dexzu embeds with no mention pings.

No historical invites are credited. The default minimum account age is seven
days and minimum stay is 24 hours. DM updates are limited to the involved member's
application, ticket and leave events. No test/broadcast DMs are sent by deployment.
