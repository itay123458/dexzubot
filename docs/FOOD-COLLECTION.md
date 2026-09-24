# Food collection

Beta-only first release. Use `/eat` to receive a random food, reaction and rarity. No coins are spent and no economy rewards are issued.

Use `/eat action:collection` or the **My collection** button to view your own collection privately. The button always reads the clicking member's collection. `/eat action:guide` explains the game. Discord's optional `action` choice preserves bare `/eat`; there is no dot prefix and no required subcommand.

The catalogue has 120 foods: 48 common, 36 rare, 24 epic and 12 legendary. Rarity odds per meal are 70%, 22%, 7% and 1%, respectively; each food within a rarity is equally likely. A new discovery is marked; duplicates increase its eaten count. Undiscovered foods appear as a remaining count in each rarity. Fictional dungeon foods are game items. Original food IDs are preserved. Larger collections split across fields within Discord's embed limits.

Progress is separate for each member and guild. PostgreSQL stores discoveries, counts, the last meal timestamp and the last 200 interaction receipts. State is saved before reporting success. A mutex and PostgreSQL session lock serialize updates; queries reuse the held database session so simultaneous players cannot exhaust the pool by borrowing extra connections. Storage failure awards no food. Duplicate delivery of a recorded interaction returns its existing result.

Default cooldown: 30 seconds. In **Beta → Operations → Food collection**, administrators can enable/pause meals and set a cooldown between 5 and 3600 seconds. Collections remain viewable while meals are paused. Public dashboard writes retain the manager grant and Discord Administrator requirements.

Checks: `node scripts/check-eat.mjs`, `node scripts/check-eat-routes.mjs`, command/button checks, browser checks and existing dashboard authorization/Beta checks. The repo has no `npm test` script.
