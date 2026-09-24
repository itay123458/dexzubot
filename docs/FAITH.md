# Faith and daily Bible verses

Initial availability: the configured Beta guild only. Main channels and settings are unchanged.

## Members

- `/bible today`: privately read today's verse using the server's saved timezone.
- `/bible status`: view the schedule and destination.
- `/bible guide`: see the channel guide and community rules.

My-Faith is for optional introductions. Religious-Talk is for respectful questions; Talk-for-Religion is voice. Bible-Talk and Quran-Talk are for their respective texts. The daily-bible channel is for reading and reactions; conversation belongs in Bible-Talk.

Respect people of every belief, including no belief. No harassment, slurs, or pressure to convert. No automatic religious roles or pings.

## Administrators

Open **Beta → Faith** in the dashboard, or use `/bible setup channel:… time:09:00 timezone:Asia/Jerusalem discussion:…`. `/bible disable` stops scheduled posting. Discord setup/disable requires Administrator. Public dashboard writes retain the existing saved manager grant and current Discord Administrator checks.

Settings: enabled, daily destination, optional discussion channel, HH:MM posting time, IANA timezone, translation. Initial translation is English World English Bible (WEB); the selector does not advertise unsupported translations. Preview and delivery history appear on the same page. Invalid or unavailable channels are reported. The bot needs View Channel, Send Messages, Embed Links and Read Message History in the daily channel.

## Delivery and recovery

Default: 09:00 Asia/Jerusalem, including daylight-saving changes. The scheduler checks once a minute when Discord is ready. The local collection rotates through 365 unique verses from 33 chapters across 14 books, retaining the original 26 readings. No external text fetch or AI generation occurs at posting time. Each verse links to its source chapter; text comes from the public-domain [World English Bible](https://ebible.org/engwebp/copyright.htm). Refresh the bundled text manually with `python scripts/import-faith-verses.py` (requires requests). Source wording is preserved with whitespace normalized and footnotes excluded. Expanding the collection changes the date-to-verse mapping; the delivery ledger still prevents a second scheduled post for an already delivered day.

Postgres stores settings and a 60-day delivery ledger. Mutex and PostgreSQL advisory locks serialize sends. Pending intent is saved before sending. After an uncertain response or restart, the original channel's history is scanned for the dated bot embed before retrying; failure to read history stops posting safely. Discord nonce enforcement also covers rapid retries. A recorded sent post is not recreated if deleted. After downtime, only today's post is eligible; older days are not backfilled. Temporary failures retry on the next minute and appear in dashboard status. This is not an absolute exactly-once guarantee if an unrecorded successful message is deleted or edited before reconciliation.

## Beta category setup

`node scripts/setup-faith-beta.mjs` previews the approved Beta guild only. To apply: `node scripts/setup-faith-beta.mjs --apply --snapshot /private/path/faith-before.json`. The snapshot must not already exist. Preserve it on the host before rebuilding a container. Existing matching channels are preserved; missing channels are created; guidance is published/pinned; daily-bible disallows ordinary member messages and permits reactions. In that channel only, inherited send/thread overrides are denied except for DexzuBot. Discord Administrators retain their normal bypass. Other channel permissions are preserved. Reruns update the saved guide messages. Setup enables the daily schedule with the created channels.

The shared release object feeds the dashboard and the Beta-only release script. Run `node scripts/release-faith.mjs` only after validating the release. It updates the prior saved announcement instead of duplicating it.

## Checks

`node scripts/check-faith.mjs`, `node scripts/check-faith-routes.mjs`, plus existing dashboard authorization and workspace checks. Deployment also requires syntax validation, dependency audit, Compose validation, Docker build and remote health checks.
