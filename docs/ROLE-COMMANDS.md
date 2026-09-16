# Role commands (beta)

Available in DexzuBot Beta, guild `1486680755869323388`. These commands use the
same bot process as the main server, but new role commands register and run only
in the beta guild. No intentional bugs are included.

| Command | Use |
| --- | --- |
| `/role add member role` | Give one member a role |
| `/role remove member role` | Remove one member's role |
| `/role create name color` | Create a role; color is optional, server permissions start empty |
| `/role edit role name color hoist mentionable` | Change only the settings supplied |
| `/role delete role` | Preview permanent deletion, then confirm |
| `/role info role` | View a role's settings and permissions |
| `/role list page` | List roles by hierarchy; page is optional |
| `/role bulk-add role audience source` | Preview giving a role to matching members |
| `/role bulk-remove role audience source` | Preview removing a role from matching members |
| `/role confirm code` | Apply your pending preview |
| `/role cancel code` | Discard your pending preview |
| `/autorole add role` | Set the single role given to new members |
| `/autorole remove role` | Stop assigning the selected role |
| `/autorole list` | View the current autorole and verification conflicts |

Bulk audiences are `humans`, `bots`, or `all`. The optional `source` role limits
the batch to members who hold it. Each preview supports up to 100 eligible
members, expires after two minutes, and can only be confirmed by its requester.
Creating another preview replaces your previous one. Restarting the bot discards
pending previews. Already applied changes are not rolled back.

Prefix commands use the same positional order: `!role add @Member @Role`,
`!role create "Beta Tester" #67D5FF`, `!role bulk-add @Role humans`, and
`!role confirm CODE`. Use the server's configured prefix if it differs from `!`.
Use slash commands when editing only a later optional setting such as color.
Existing prefix staff/channel restrictions still apply.

Role management requires native **Manage Roles**, even when a configured staff
role grants access to other commands. Autorole also requires **Manage Server**;
setting an autorole requires Manage Roles and cannot conflict with verification.
The selected role must be below both the member's and bot's highest role (the
server owner bypasses the member hierarchy). Managed roles and @everyone are
excluded. Role assignment skips the requester, server owner, this bot, and members
above either hierarchy. The bot does not grant permissions the requester lacks.

Bulk changes recheck current permissions and memberships for each member and
report actual changed, skipped, and failed counts. They stop if authorization is
lost. Only one confirmed batch runs per server at a time. Discord audit-log
reasons include the requester ID.

The main server keeps its existing prefix autorole command. `/autorole` is newly
available as a slash command only in beta. Both paths share the corrected role
lookup and save-error handling.

## Beta notes

The private dashboard now includes all role controls under **Beta → Operations →
Role management**, including autorole, member assignments, create/edit/delete,
role details, and confirmed bulk changes. Release notes appear on the Beta
overview, with a command guide alongside the controls.

Dashboard access is administrative access through the existing private connection;
it is not a Discord user login. Dashboard role actions use the bot's actual
permissions and hierarchy and are labelled `private Beta dashboard` in Discord's
audit reasons. They never impersonate a guild owner. Pending dashboard previews
share one slot per server and are separate from individual Discord users' previews.
Forms protect unsaved drafts, including separate prefix-settings drafts.

Role commands are ready to try. You can add or remove member roles, create roles,
change their name and color, or check their details. Bulk changes show a preview
first, so you can check the audience before anything happens. Autorole also works
with slash commands now. A failed save will no longer say it worked.
