# Beta community tools

Everything here is restricted to guild `1486680755869323388`. The main server
keeps its existing commands and economy writes. Release to Main requires a later
explicit request; there is no automatic promotion switch.

Open **Beta → Operations → Community tools** in the private dashboard. Each
feature can be enabled separately. Choose roles/channels before publishing.
Save changes first; **Publish panel** updates its saved message rather than
posting duplicates. Changing the ticket switches updates its existing panel.

| Feature | Try it | Settings |
| --- | --- | --- |
| Invite rewards | `/invite-rewards balance`, `/invite-rewards claim` | Milestones, account age, membership time, panel channel |
| Ticket categories | General Support, Report a Member, Partnership | Three separate button toggles; existing ticket category and staff access |
| Applications | `/beta-staff applications` | Questions, optional questions, reviewer role, private review channel |
| Leave | `/beta-staff leave` | Staff role; 1–14 days; reviewer approval required |
| Activity | `/beta-staff activity`, `activity-start`, `activity-end` | Staff role, response deadline, panel channel |
| Server information | `/community-beta panel type:Server information` | Destination and channel links |

The server information panel also links to the existing private dashboard;
that link does not change who can access it.

Reviewers can approve or deny requests in the private dashboard or review
channel. Application answers are saved one at a time in a private channel.
Resume uses saved progress; cancelling allows a later new application without
creating another channel. Optional questions can be skipped. Changed channel
permissions are checked before publishing sensitive answers.

DM switches cover application submissions/decisions, ticket opening/closing,
and leave submissions/decisions. They contact only the involved member, with no
staff-reminder or broadcast DMs. Failed delivery is reported separately from
successful persistence. No live test DMs are sent by deployment.

Invite rewards use a fresh baseline and conservative attribution. Bots,
self-invites, too-new accounts, departures/rejoins, ambiguous usage changes, and
untracked historical joins do not qualify. Current members cannot be re-invited
to farm rewards. Single-use/deleted or vanity invites may remain un-attributed.
Discord does not prove that separate accounts belong to different humans.
Each milestone pays once and rewards are cumulative. Claim markers and wallet
credits commit in one PostgreSQL transaction. Beta wallet snapshots retain
credits that arrived during an ordinary balance update; explicit resets still
work. Tracking restarts safely after feature changes or a gateway reconnect.

Activity checks snapshot the selected staff role when opened. Responses are
saved; approved leave overlapping the check appears in the excluded list.
Deadlines recover after restart, and the check's original Discord message is
updated with the audit. Members without the configured staff role do not become
eligible merely by being administrators; choose/assign the staff role to test.

The beta deployment uses the existing Beta Moderator role for staff and Beta
Admin role for reviewers. Those roles are not automatically assigned to anyone.
All role/channel selections can be changed in the dashboard.

Developer checks: focused `node --test tests/*.test.js`,
`scripts/check-community-beta.mjs`, `scripts/check-community-ui.mjs`, and
`scripts/check-community-postgres.mjs`. The PostgreSQL check refuses any target
except the isolated local database `127.0.0.1:15432/dexzu_community_qa`.
No new runtime dependencies or database migration are required.
