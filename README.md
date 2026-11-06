# LikeyBot v1

A modular JavaScript Discord bot for multiple servers. Prefixes and protection settings are saved per server in JSON files.

## Bot presence

- LikeyBot uses a Streaming presence named `Watching users | N servers`. The server count updates when the bot starts, joins a server, or leaves one.

## Prefix commands

- `,ping` — shows bot gateway latency.
- `,prefix` — shows this server's prefix.
- `,prefix !` — changes the prefix for this server only (requires Manage Server).
- `,role @user @role` — toggles the role on the member (requires Manage Roles). It uses this server's current prefix. Non-whitelisted users who change an Administrator role are punished by Anti Nuke.
- `,addrole <role name>` — creates a role with no permissions, no color, no hoist, and no mentionable setting. Names can include spaces and symbols. The owner, Administrators, and members with Manage Roles can use it; unauthorized members receive no reply.
- `,kick @user [reason]` — kicks a member. Only Administrators can use it, and they must be whitelisted in this server. Non-Administrators receive no reply and no action is taken.
- `,ban @user [reason]` — bans a member. Only Administrators can use it, and they must be whitelisted in this server. Non-Administrators receive no reply and no action is taken.
- `,unban <user ID> [reason]` — unbans a user by Discord ID. It follows the same Administrator and whitelist rules as `,kick` and `,ban`.
- `,jail @member #channel` — temporarily removes the member's roles and member-specific channel overwrites, then gives access only to the selected text channel. Requires Manage Roles; the target cannot be an Administrator or the server owner.
- `,unjail @member` — removes the jail role and restores saved roles and member-specific channel overwrites. Requires Manage Roles. Both commands use this server's current prefix and keep jail data separate per server.
- `,snipe` — shows the latest deleted message in the current channel. `,snipe @member` shows that member's latest deleted message in the current channel. The server owner can always use it; other users need Administrator or Manage Messages permission. Deleted-message history is kept in memory and resets when the bot restarts.
- `,afk [reason]` — sets or clears your AFK status. Any member can use it; the status is stored separately per server.
- `,lb` — shows the top 15 members by chat messages and voice time, three ranks per page, with Previous/Next buttons and the supplied leaderboard banner.
- `,stats` — shows your chat-message and voice-time totals in this server.
- `,timeout @user 1s` — applies a timeout; supports `s`, `m`, `h`, `d`, `w`, and `y` units, up to Discord's 28-day maximum. Users with Administrator permission cannot be timed out.
- `,untimeout @user` — removes an active timeout.
- `,lock` / `,unlock` — locks or unlocks the current text channel.
- `,slowmode <seconds>` — sets the current channel's slowmode from 0 (off) to 21600 seconds (6 hours); accepts values such as `2` or `2s`.
- `,sp` / `,serverprofile` — shows the server name, member count, bot count, creation date, icon, description, and banner when available; shared 8-second cooldown per server. Follows this server's configured prefix.
- `,av` / `,av @user` — sends the caller's or a mentioned member's avatar as an image only.
- `,banner` / `,banner @user` — sends the caller's or a mentioned member's profile banner as an image only; replies with the no-banner notice when no banner is set.

## AFK behavior

- `,afk` sets AFK without a reason; `,afk <reason>` stores any text, symbols, or emoji as the reason. A Discord invite in the reason adds an Anti Link warning, and the third warning triggers the existing 10-minute timeout behavior.
- When someone mentions an AFK member, LikeyBot posts `<:afk:1568138347275100162> @user was AFK` and deletes its notice after 5 seconds. The first message an AFK member sends removes their status and produces a return notice that is also deleted after 5 seconds.
- AFK statuses are saved per member and per server.

## Activity stats

- After the server owner runs `/setup stats`, every human message counts as one chat message, including emoji-only messages. Voice time counts while a member is connected to a voice channel; bots are excluded.
- `/lb` ranks chat messages and voice time separately. Each category has a top-15 list split into pages of three, with top-three medal emojis and Previous/Next buttons. The leaderboard uses the supplied banner image.
- `/stats` shows the caller's totals. Both commands use a shared 5-second cooldown per member per server and white embeds. Stats are stored separately for each server.

## Slash commands

- `/setup autojoin role:@role` — sets this server's role for new human members. Only the server owner can run it; each server stores its own selected role.

- `/setup protection` — enables Anti Link and Anti Nuke Protection. Only the exact server owner can run it; administrators and other roles cannot.
- `/setup leveling system` — enables per-server leveling; only the server owner can run setup commands.
- `/setup ticket channel:#channel panel_name:Support` — creates a uniquely named panel in the selected channel. Its name is also used as the initial panel title. New tickets are created in that channel's category.
- `/setup logs channel:#logs` — sets this server's log channel. Only the exact server owner can configure it; each server has its own setting.
- `/setup stats` — enables per-server chat-message and voice-time tracking. Only the exact server owner can enable it.
- `/setup welcomer setup` — creates or repairs this server's `Лайк Portal` category with synchronized `Лайк Entrance` and `Лайк Exit` channels. Everyone can view them; members with Administrator, Manage Messages, or Manage Channels permission can chat. Only the server owner can configure this feature.
- `/setup welcomer edit image:<attachment>` — changes this server's welcome/exit image. PNG, JPG, WEBP, and animated GIF are supported; video is rejected. The supplied `welcomeexit.png` is the default.
- `/edit panel` — choose a named panel from autocomplete to edit its title, text, and image, or choose **Make Another Panel** and provide `panel_name` to create and post one in the current channel. You can also provide title, text, and image while creating it. The new panel name is used as its initial title. Existing panels can be previewed and published with **Bring Panel Here**.
- `/whitelist anti-link`, `/whitelist creating-role`, `/whitelist creating-channel`, `/whitelist deleting-role`, `/whitelist deleting-channel`, `/whitelist giving-admin-role`, and `/whitelist making-role-with-admin` each take `status:Enable|Disable` and a `role`. When enabled, members with that selected role are exempt from the corresponding Anti Link or Anti Nuke action.
- `/whitelist all status:Enable|Disable role:@role` — applies the selected role and status to every listed action, including Anti Link. These settings are owner-only and stored separately per server. **Disable** means the selected role is not exempt for that action. Existing manually whitelisted users remain exempt when an action is enabled; a disabled action exempts no one except the server owner and LikeyBot itself.

The slash commands are registered separately for each server when the bot starts or joins a server. They are independent of the text prefix.

## Server backup and restore

- `/backup` creates a snapshot of roles, channels, channel permission overwrites, server settings, and this server's LikeyBot configuration. Only the exact server owner can run it. The snapshot is saved as `data/backups/<server-id>.json` and is sent as an ephemeral attachment when it fits Discord's upload limit.
- `,restore` restores the backup for the current server. The command follows that server's configured prefix. Only the exact server owner can run it; administrators and other members cannot.
- Restore asks for confirmation before it makes changes. It creates duplicate roles and channels and restores supported settings. It does not delete existing roles or channels. The bot needs **Manage Roles** and **Manage Channels**; server-level settings may also require **Manage Guild**. Role and channel positions are best-effort and depend on the bot's hierarchy.
- Backups are isolated by server ID. A restore only reads `data/backups/<current-server-id>.json`; role and channel references in bot settings are remapped to the new copies in that same server. User activity history and open tickets are not included.

## Configuration persistence

- Setup choices and whitelist action toggles are written to JSON files in `data/`, keyed by server ID. Prefixes, ticket panels, logs, leveling, jail state, Auto Join, and protection settings reload from those files when LikeyBot starts again.
- Keep the project's `data/` folder when restarting or moving the bot. Normal shutdown with Ctrl+C or SIGTERM flushes pending activity statistics before the process exits. Snipe history and short command cooldowns are temporary runtime data and reset when the bot restarts.

## Server logs

- Logs cover member joins and leaves, message edits and deletions, uploaded media, voice channel joins/leaves/moves, channel and role changes, and bans/unbans.
- Log embeds are red. Images, GIFs, videos, and audio files are forwarded as normal attachments without embeds. Attachments larger than 25 MB are not copied.
- Each server's selected log channel is stored separately in `data/log-settings.json`. The bot needs View Channel, Send Messages, Embed Links, and Attach Files access in that channel.

## Leveling behavior

- When enabled, each member earns 1 XP every 60 seconds, regardless of which text channel they use. The XP requirement starts at 110 and increases by 10 at each level. Progress is stored per user and per server, and levels stop at 100. Level-up announcements are sent in the channel where the member earned the XP that completed the level.

## Ticket behavior

- Ticket panels use a red embed with the supplied default image. Each named panel has its own title, text, and custom image, stored separately per server. PNG, JPG, WEBP, and animated GIF uploads are supported. Ticket channels are created under the category containing the panel and are private to the opener, server owner, and bot; Discord administrators can still bypass channel privacy. Each member can have one open ticket at a time. Closing a ticket gives a 5-second notice, removes the opener's access (except server owners and administrators, who can always view channels), and leaves a Delete Ticket button for administrators.

## Protection behavior

- **Anti Link:** Deletes messages containing links and warns the sender. On the third warning, the sender receives a 10-minute timeout. Warnings are stored per server and user and reset after a successful timeout. GIF-only links are allowed for members with an explicit server role or Embed Links permission in that channel; a message containing any other link is still blocked.
- **Anti Nuke:** When a bot joins, LikeyBot checks the audit log to identify who added it. If that user is not the server owner or on the whitelist, LikeyBot removes their manageable roles and sends the owner a notice with the user and bot details. It also punishes unwhitelisted users who create or delete channels or roles, grant or remove an Administrator role for themselves or another member, or turn on Administrator permission for an existing role. When possible, it removes the newly granted Administrator permission or deletes a newly created Administrator role. The owner is told what action triggered the punishment. The server owner and LikeyBot itself are always exempt; other bots are not exempt unless explicitly whitelisted. If the audit log cannot identify the actor, no roles are removed and the owner is notified.
- **Kick, Ban, and Unban commands:** The server owner is exempt from the whitelist. Other users must have Administrator and be whitelisted. A non-Administrator's attempt is silently ignored. An unwhitelisted Administrator's attempt is blocked before the target action, triggers immediate role removal when possible, and notifies the server owner.

## Setup

1. Install Node.js 20 or newer and run `npm install` in this folder.
2. Keep your bot token in the quoted `TOKEN` value in `index.js`. Never share the real token.
3. Server activation notifications use `LIKEYBOT_SERVER_ACTIVATION_WEBHOOK` from the ignored `.env` file. Keep webhook URLs private; `.env.example` is only a placeholder template.
4. In the Discord Developer Portal, enable **Message Content Intent** and **Server Members Intent**.
5. Give LikeyBot **View Audit Log**, **Manage Messages**, **Moderate Members**, **Manage Roles**, **Kick Members**, and **Ban Members** permissions. The code also enables the Guild Moderation gateway intent for audit log entry events. Place the bot's top role above roles it may need to remove or members it may need to kick or ban.
6. Start it with `node index.js`.

The server owner should run `/setup`. Use `/whitelist` to manage who may add bots and use the protected kick/ban commands.





