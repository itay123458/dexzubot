# Animated beta messages

Beta guild `1486680755869323388` gets pre-rendered, four-second GIF artwork:
a 256px Dexzu thumbnail and the existing slim giveaway design at 720 × 166.
Only perimeter light and particles move. Text, buttons, avatar, and lettering
stay still. There are no recurring Discord message edits or rendering jobs.

Try `/ping` or `/role list`. In the private dashboard choose **Beta → Operations
→ Animated messages** to preview, enable, or disable the artwork. Saving changes
new replies and refreshes configured support, verification, reaction-role, and
giveaway panels. Old command replies retain their original artwork. Discord's
client settings determine GIF playback; the web preview respects reduced motion
and pauses when the tab is hidden. Custom user images are preserved.

Artwork is gated by `BETA_GUILD_ID`. Unknown guilds and DMs stay static. Event
execution carries guild context with AsyncLocalStorage; scheduled or standalone
renderers can pass `guildId` explicitly to `createEmbed`. Guild-specific panel
builders use their explicit guild. Main-server visuals remain unchanged.

Deployment: build the image, run `node scripts/release-embed-motion.mjs --install`
inside the new image on the existing Compose network, then start the bot. This
stores GIFs in the beta logging-test channel and persists their Discord CDN URLs.
Keep that artwork message. After health checks, run the script with `--announce`;
reruns edit the saved announcement instead of posting another. Both operations
fail closed outside the approved beta guild. No credentials belong in this file.

Offline assets can be rebuilt with `scripts/build-embed-motion.mjs` using
`PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, and `FFMPEG`. No new runtime dependency.
