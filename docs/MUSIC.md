# Music

Join a voice channel and use `/play query:<song name and artist>`. Name searches show up to ten recordings with their title, artist and duration. Pick the version you want from the private menu. The bot queues that exact resolved track; it does not run another search after selection.

Example: `/play query:nevada vicetone`. A search for just `nevada` may put a different artist first. The provider can include covers, slowed recordings and remixes. No result is guaranteed to be the original; read its title and artist. Refine the query if your recording is absent.

Only the requesting member can select a result. Menus expire after 60 seconds without queueing anything. Voice membership is checked again after selection; members must share the bot's voice channel when a player already exists. Supported direct links and playlists retain their existing behavior; YouTube URLs remain unsupported.

Use `/queue`, `/nowplaying` and `/music` for playback controls. Music is enabled in Main and Beta. Search selection has no additional dashboard setting; the command guide and release notes describe the current behavior.

Verification: `node scripts/check-music-search.mjs` covers selection versus first-result playback, caller ownership, expiry, invalid values, exact queued object, voice changes, supported direct URLs, playlists, duplicate protection and empty results.
