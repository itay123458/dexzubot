# Music commands

Use slash commands or the server's configured prefix. Main and Beta currently use `!`.

- `!play nevada vicetone` searches the complete song name and artist, then queues the first result, as `/play` does. Quotes around the query are optional.
- `!join`, `!queue 2`, `!nowplaying` (or `!np`).
- `!music pause`, `!music resume`, `!music skip`, `!music stop`, `!music leave`.
- `!music volume 50`, `!music shuffle`, `!music loop track` (also `queue` or `none`).
- `!music seek 60`, `!music remove 2`, `!music move 2 3`, `!music clear`.
- `!music 247 true` or `!music 247 false` toggles staying connected while idle.

Existing shorthand commands: `!pause`, `!resume`, `!skip`, `!stop`, `!volume 50`, `!leave`.

Prefix use retains the existing staff/command-access requirement, enabled setting and allowed channel/role restrictions. These remain configurable under **Operations > Prefix Commands** and **Staff Roles**. Per-command voice and permission checks are shared with slash execution. Slash commands remain available.

This enables another way to invoke music; it does not fix external audio-server failures. Checks: `node scripts/check-prefix-music.mjs` plus the existing prefix settings, staff and giveaway checks.
