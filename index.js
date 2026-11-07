const { Client, WebhookClient, EmbedBuilder, GatewayIntentBits, Events, ActivityType, AuditLogEvent, PermissionFlagsBits, PermissionsBitField, Partials } = require('discord.js');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { getPrefix } = require('./utils/prefixes');
const { getGuildSettings, isWhitelisted, isWhitelistedForAction, addLinkWarning, resetLinkWarnings } = require('./utils/moderation');
const { awardMessageXp } = require('./utils/leveling');
const { handleTicketButton } = require('./utils/tickets');
const { handleAfkActivity } = require('./utils/afk');
const { sendServerLog, sendMediaOnlyLog, listAttachments, shortText } = require('./utils/logs');
const { recordChatMessage, recordVoiceStateUpdate, initializeVoiceSessions, handleLeaderboardButton } = require('./utils/stats');
const statsApi = require('./utils/stats');
const { flushStats } = statsApi;
const { handleBackupButton } = require('./utils/backup');
const { recordDeletedMessage } = require('./utils/snipe');
const { sendMemberCard } = require('./utils/welcomer');

let shutdownStarted = false;
async function saveBeforeShutdown(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  try {
    await flushStats();
  } catch (error) {
    console.error('Could not finish saving activity data before shutdown:', error.message);
  }
  client.destroy();
  console.log('LikeyBot saved local activity data and shut down after ' + signal + '.');
  process.exit(0);
}


function loadLocalEnvironment() {
  const envPath = path.join(__dirname, '.env');
  let contents;
  try {
    contents = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnvironment();

// Keep this file private because it contains your bot token.
const token = process.env.DISCORD_TOKEN;


const client = new Client({
  rest: { timeout: 60_000 },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel],
});

const healthServer = http.createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/health') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }

  const isBotReady = client.isReady();
  res.writeHead(isBotReady ? 200 : 503, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(isBotReady ? 'LikeyBot is online' : 'LikeyBot is connecting');
});

const healthPort = Number(process.env.PORT) || 10000;
healthServer.listen(healthPort, '0.0.0.0', () => {
  console.log('LikeyBot health endpoint is listening on port ' + healthPort + '.');
});

const LINK_REGEX = /https?:\/\/[^\s<>()]+|www\.[^\s<>()]+|discord\.gg\/[^\s<>()]+|discord(?:app)?\.com\/invite\/[^\s<>()]+|(?<![@\w-])(?:[\w-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*)?/gi;

function updateStreamingPresence() {
  if (!client.user) return;
  const serverCount = client.guilds.cache.size;
  const serverLabel = serverCount === 1 ? 'server' : 'servers';
  client.user.setActivity('Watching users | ' + serverCount + ' ' + serverLabel, {
    type: ActivityType.Streaming,
    url: 'https://www.twitch.tv/discord',
  });
}

process.once('SIGINT', () => { void saveBeforeShutdown('SIGINT'); });
process.once('SIGTERM', () => { void saveBeforeShutdown('SIGTERM'); });

function findLinks(content) {
  return content.match(LINK_REGEX) || [];
}

function isGifLink(link) {
  const candidate = link.startsWith('www.') || !link.includes('://') ? 'https://' + link : link;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();
  if (/\.gif$/i.test(pathname)) return true;
  if ((host === 'tenor.com' || host.endsWith('.tenor.com')) && /^\/view\/.*gif/.test(pathname)) return true;
  if ((host === 'giphy.com' || host.endsWith('.giphy.com')) && /^\/gifs\//.test(pathname)) return true;
  return false;
}

function hasGifAccess(message) {
  const member = message.member;
  if (!member) return false;
  const hasExplicitRole = member.roles.cache.some((role) => role.id !== message.guild.id);
  const canEmbedLinks = message.channel.permissionsFor(member)?.has(PermissionFlagsBits.EmbedLinks) || false;
  return hasExplicitRole || canEmbedLinks;
}

const commands = new Map();
const commandsFolder = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsFolder).filter((name) => name.endsWith('.js'))) {
  const command = require(path.join(commandsFolder, file));
  commands.set(command.name, command);
  for (const alias of command.aliases || []) commands.set(alias, command);
}

async function syncGuildSlashCommands(guild) {
  const slashCommands = [...commands.values()].filter((command) => command.type === 'slash');
  if (slashCommands.length === 0) return;

  const existingCommands = await guild.commands.fetch();
  const obsoleteAutoJoin = existingCommands.find((item) => item.name === 'setupautojoin');
  if (obsoleteAutoJoin) await guild.commands.delete(obsoleteAutoJoin.id);
  for (const command of slashCommands) {
    const definition = command.data.toJSON();
    const existing = existingCommands.find((item) => item.name === command.name);
    if (existing) {
      await guild.commands.edit(existing.id, definition);
    } else {
      await guild.commands.create(definition);
    }
  }
}

async function findBotAdder(guild) {
  if (!client.user?.id) return null;
  const botMember = guild.members.me || await guild.members.fetch(client.user.id).catch(() => null);
  if (!botMember?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return null;

  const joinTime = guild.joinedTimestamp || Date.now();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
    const auditLog = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 10 }).catch(() => null);
    const entry = auditLog?.entries.find((candidate) =>
      candidate.targetId === client.user.id && candidate.createdTimestamp >= joinTime - 30_000
    );
    if (entry?.executor) return entry.executor;
  }
  return null;
}

async function sendServerActivationNotification(guild) {
  const webhookUrl = process.env.LIKEYBOT_SERVER_ACTIVATION_WEBHOOK;
  if (!webhookUrl) {
    console.warn('Server activation webhook is not configured. Add LIKEYBOT_SERVER_ACTIVATION_WEBHOOK to .env.');
    return;
  }

  const [owner, inviter] = await Promise.all([
    guild.fetchOwner().catch(() => null),
    findBotAdder(guild),
  ]);
  const serverIcon = guild.iconURL({ extension: 'png', size: 1024 });
  const createdAt = Math.floor(guild.createdTimestamp / 1000);
  const serverName = guild.name.replace(/[\r\n]/g, ' ').slice(0, 200);
  const inviterValue = inviter
    ? inviter.toString() + ' (' + inviter.tag + ')'
    : 'Unknown (I need the View Audit Log permission to identify who added me.)';
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('<a:Aura:1568142699792437289> Notification!')
    .addFields(
      {
        name: '<a:user:1568143113548071012> New Server Activation',
        value: 'Member count: **' + (guild.memberCount ?? 'Unknown') + '**',
        inline: true,
      },
      {
        name: '<:diamonds:1568143547826442323> Server',
        value: serverName,
        inline: true,
      },
      {
        name: '<a:crystal:1568147888515842048> Server Count',
        value: 'Counter: **' + client.guilds.cache.size + '**',
        inline: true,
      },
      {
        name: '<:diamonds:1568143547826442323> Server Created',
        value: '<t:' + createdAt + ':F>',
        inline: true,
      },
      {
        name: '<:diamonds:1568143547826442323> Owner',
        value: owner ? owner.toString() : ('<@' + guild.ownerId + '>'),
        inline: true,
      },
      {
        name: '<:diamonds:1568143547826442323> Invite By',
        value: inviterValue,
        inline: false,
      },
    )
    .setFooter({ text: 'Server ID: ' + guild.id })
    .setTimestamp();
  if (serverIcon) embed.setThumbnail(serverIcon);

  let webhook;
  try {
    webhook = new WebhookClient({ url: webhookUrl });
    await webhook.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch {
    console.error('Could not send the server activation notification. Check the webhook configured in .env.');
  } finally {
    webhook?.destroy();
  }
}

async function notifyOwner(guild, text) {
  try {
    const owner = await guild.fetchOwner();
    await owner.send(text);
  } catch (error) {
    console.error('Could not DM the server owner:', error.message);
    if (guild.systemChannel) {
      await guild.systemChannel.send(text).catch((sendError) => {
        console.error('Could not post the owner notice:', sendError.message);
      });
    }
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  updateStreamingPresence();
  console.log('LikeyBot is online as ' + readyClient.user.tag + ' | servers: ' + readyClient.guilds.cache.size);
  await initializeVoiceSessions([...readyClient.guilds.cache.values()]);
  for (const guild of readyClient.guilds.cache.values()) {
    try {
      await syncGuildSlashCommands(guild);
    } catch (error) {
      console.error('Could not register slash commands in ' + guild.name + ':', error.message);
    }
  }
});

client.on(Events.GuildCreate, async (guild) => {
  updateStreamingPresence();
  const notificationPromise = sendServerActivationNotification(guild).catch(() => {
    console.error('Could not prepare the server activation notification.');
  });
  await initializeVoiceSessions([guild]);
  try {
    await syncGuildSlashCommands(guild);
  } catch (error) {
    console.error('Could not register slash commands in ' + guild.name + ':', error.message);
  }
  await notificationPromise;
});

client.on(Events.GuildDelete, () => {
  updateStreamingPresence();
});

function userLabel(user) {
  return user ? user.tag + ' (<@' + user.id + '>)' : 'Unknown user';
}

function channelKind(channel) {
  if (channel.isVoiceBased?.()) return 'voice channel';
  if (channel.isThread?.()) return 'thread';
  return 'channel';
}

client.on(Events.GuildMemberRemove, async (member) => {
  try { await sendMemberCard(member, 'exit'); }
  catch (error) { console.error('Welcomer exit handler failed:', error.message); }
  await sendServerLog(member.guild, 'Member Left', userLabel(member.user) + ' left the server.');
});

client.on(Events.GuildBanAdd, async (ban) => {
  await sendServerLog(ban.guild, 'Member Banned', userLabel(ban.user) + ' was banned.');
});

client.on(Events.GuildBanRemove, async (ban) => {
  await sendServerLog(ban.guild, 'Member Unbanned', userLabel(ban.user) + ' was unbanned.');
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const changes = [];
  if (oldMember.nickname !== newMember.nickname) {
    changes.push({ name: 'Nickname', value: (oldMember.nickname || oldMember.user.username) + ' → ' + (newMember.nickname || newMember.user.username) });
  }
  const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id)).map((role) => role.name);
  const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id)).map((role) => role.name);
  if (addedRoles.length > 0) changes.push({ name: 'Roles Added', value: addedRoles.join(', ') });
  if (removedRoles.length > 0) changes.push({ name: 'Roles Removed', value: removedRoles.join(', ') });
  if (changes.length === 0) return;
  await sendServerLog(newMember.guild, 'Member Updated', userLabel(newMember.user) + ' had server profile changes.', changes);
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  recordVoiceStateUpdate(oldState, newState);
  const member = newState.member || oldState.member;
  const guild = newState.guild || oldState.guild;
  const oldChannel = oldState.channel;
  const newChannel = newState.channel;
  if (!guild || !member || oldChannel?.id === newChannel?.id) return;

  let description;
  if (!oldChannel && newChannel) description = userLabel(member.user) + ' joined voice channel **' + newChannel.name + '**.';
  else if (oldChannel && !newChannel) description = userLabel(member.user) + ' left voice channel **' + oldChannel.name + '**.';
  else description = userLabel(member.user) + ' moved from **' + oldChannel.name + '** to **' + newChannel.name + '**.';
  await sendServerLog(guild, 'Voice Channel Activity', description);
});

client.on(Events.ChannelCreate, async (channel) => {
  if (!channel.guild) return;
  await sendServerLog(channel.guild, 'Channel Created', 'A ' + channelKind(channel) + ' named **' + channel.name + '** was created.');
});

client.on(Events.ChannelDelete, async (channel) => {
  if (!channel.guild) return;
  await sendServerLog(channel.guild, 'Channel Deleted', 'A ' + channelKind(channel) + ' named **' + channel.name + '** was deleted.');
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  const changes = [];
  if (oldChannel.name !== newChannel.name) changes.push({ name: 'Name', value: oldChannel.name + ' → ' + newChannel.name });
  if ('topic' in oldChannel && oldChannel.topic !== newChannel.topic) {
    changes.push({ name: 'Topic', value: (oldChannel.topic || 'None') + ' → ' + (newChannel.topic || 'None') });
  }
  if ('parentId' in oldChannel && oldChannel.parentId !== newChannel.parentId) {
    changes.push({ name: 'Category', value: (oldChannel.parent?.name || 'None') + ' → ' + (newChannel.parent?.name || 'None') });
  }
  if (changes.length === 0) changes.push({ name: 'Details', value: 'Channel settings or permissions were changed.' });
  await sendServerLog(newChannel.guild, 'Channel Updated', '**' + newChannel.name + '** was updated.', changes);
});

client.on(Events.RoleCreate, async (role) => {
  await sendServerLog(role.guild, 'Role Created', 'Role **' + role.name + '** was created.');
});

client.on(Events.RoleDelete, async (role) => {
  await sendServerLog(role.guild, 'Role Deleted', 'Role **' + role.name + '** was deleted.');
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push({ name: 'Name', value: oldRole.name + ' → ' + newRole.name });
  if (String(oldRole.permissions.bitfield) !== String(newRole.permissions.bitfield)) changes.push({ name: 'Permissions', value: 'Role permissions were changed.' });
  if (changes.length === 0) return;
  await sendServerLog(newRole.guild, 'Role Updated', 'Role **' + newRole.name + '** was updated.', changes);
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author?.bot || message.attachments.size === 0) return;
  await sendMediaOnlyLog(
    message.guild,
    'Media posted by ' + userLabel(message.author) + ' in <#' + message.channelId + '>:',
    listAttachments(message.attachments),
  );
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild) return;
  recordDeletedMessage(message);
  const author = message.author ? userLabel(message.author) : 'Unknown user';
  const content = message.partial ? 'Message content was unavailable.' : (message.content || 'No text content.');
  const fields = [
    { name: 'Author', value: author },
    { name: 'Channel', value: '<#' + message.channelId + '>' },
    { name: 'Content', value: shortText(content, 1000) },
  ];
  await sendServerLog(message.guild, 'Message Deleted', 'A message was deleted.', fields, listAttachments(message.attachments));
});

client.on(Events.MessageBulkDelete, (messages) => {
  for (const message of messages.values()) recordDeletedMessage(message);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  const guild = newMessage.guild || oldMessage.guild;
  if (!guild || newMessage.author?.bot) return;
  const oldAttachments = listAttachments(oldMessage.attachments).map((attachment) => attachment.id).join(',');
  const newAttachments = listAttachments(newMessage.attachments).map((attachment) => attachment.id).join(',');
  if (oldMessage.content === newMessage.content && oldAttachments === newAttachments) return;
  const fields = [
    { name: 'Author', value: newMessage.author ? userLabel(newMessage.author) : 'Unknown user' },
    { name: 'Channel', value: '<#' + newMessage.channelId + '>' },
    { name: 'Before', value: shortText(oldMessage.partial ? 'Original content unavailable.' : oldMessage.content || 'No text content.', 1000) },
    { name: 'After', value: shortText(newMessage.content || 'No text content.', 1000) },
  ];
  await sendServerLog(guild, 'Message Edited', 'A message was edited.', fields, listAttachments(newMessage.attachments));
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;

  recordChatMessage(message.guild.id, message.author.id, message.member?.displayName || message.author.globalName || message.author.username);

  const currentPrefix = getPrefix(message.guild.id);
  const commandInput = message.content.startsWith(currentPrefix)
    ? message.content.slice(currentPrefix.length).trim()
    : '';
  const initialCommandName = commandInput.split(/\s+/, 1)[0].toLowerCase();
  try {
    await handleAfkActivity(message, initialCommandName === 'afk');
  } catch (error) {
    console.error('Could not process AFK status:', error.message);
  }

  const settings = getGuildSettings(message.guild.id);
  const detectedLinks = findLinks(message.content);
  const onlyGifLinks = detectedLinks.length > 0 && detectedLinks.every(isGifLink);
  const bypassAntiLink = isWhitelistedForAction(message.guild.id, message.author.id, message.guild.ownerId, 'antiLink', message.member);
  if (settings.antiLink && detectedLinks.length > 0 && !bypassAntiLink && !(onlyGifLinks && hasGifAccess(message))) {
    try {
      await message.delete();
    } catch (error) {
      console.error('Could not delete a prohibited link:', error.message);
      return;
    }

    const warningCount = addLinkWarning(message.guild.id, message.author.id);
    if (warningCount >= 3) {
      try {
        const member = message.member || await message.guild.members.fetch(message.author.id);
        await member.timeout(10 * 60 * 1000, 'Three Anti Link warnings');
        resetLinkWarnings(message.guild.id, message.author.id);
        await message.channel.send(message.author.tag + ' received a 10-minute timeout after 3 Anti Link warnings.');
      } catch (error) {
        await message.channel.send('Anti Link removed the message, but I could not apply the timeout. Check my Moderate Members permission and role position.');
        console.error('Could not apply Anti Link timeout:', error.message);
      }
    } else {
      await message.channel.send(message.author.toString() + ', links are not allowed here. Warning ' + warningCount + '/3.');
    }
    return;
  }

  const levelUp = awardMessageXp(message.guild.id, message.author.id);
  if (levelUp) {
    const levelMessage = levelUp.reachedMax
      ? '<a:congrats:1568104452366401617> ' + message.author.toString() + ' has reached level 100!'
      : '<a:congrats:1568104452366401617> ' + message.author.toString() + ' leveled up to level ' + levelUp.level + '!';
    await message.channel.send(levelMessage).catch((error) => {
      console.error('Could not announce a level up:', error.message);
    });
  }

  if (!message.content.startsWith(currentPrefix)) return;

  const input = message.content.slice(currentPrefix.length).trim();
  if (!input) return;
  const separator = input.search(/\s/);
  const commandName = (separator === -1 ? input : input.slice(0, separator)).toLowerCase();
  const argsText = separator === -1 ? '' : input.slice(separator).trim();
  const command = commands.get(commandName);
  if (!command || command.type !== 'message') return;

  try {
    await command.execute({ client, message, argsText, currentPrefix });
  } catch (error) {
    console.error('Error running command ' + commandName + ':', error);
    await message.reply('Something went wrong while running that command. Please try again later.');
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.guild) return;

  try {
    if (interaction.isButton()) {
      const handled = await handleTicketButton(interaction, client);
      if (!handled && !(await handleLeaderboardButton(interaction))) await handleBackupButton(interaction, statsApi);
      return;
    }
    if (interaction.isAutocomplete()) {
      const command = commands.get(interaction.commandName);
      if (command?.type === 'slash' && command.autocomplete) await command.autocomplete(interaction);
      else await interaction.respond([]);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (!command || command.type !== 'slash') return;
    await command.execute(interaction);
  } catch (error) {
    if (interaction.isAutocomplete() && error.code === 10062) return;
    const commandName = interaction.commandName || 'ticket button';
    console.error('Error running interaction ' + commandName + ':', error);
    const response = { content: 'Something went wrong while running that command.', ephemeral: true };
    try {
      if (interaction.isAutocomplete()) await interaction.respond([]).catch(() => {});
      else if (interaction.replied || interaction.deferred) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    } catch (responseError) {
      console.error('Could not send the interaction error response:', responseError.message);
    }
  }
});

client.on(Events.GuildMemberAdd, async (addedMember) => {
  const guild = addedMember.guild;
  try { await sendMemberCard(addedMember, 'entry'); }
  catch (error) { console.error('Welcomer entry handler failed:', error.message); }
  await sendServerLog(guild, 'Member Joined', userLabel(addedMember.user) + ' joined the server.');
  const settings = getGuildSettings(guild.id);

  if (!addedMember.user.bot && settings.autoJoinRoleId) {
    const autoJoinRole = await guild.roles.fetch(settings.autoJoinRoleId).catch(() => null);
    if (!autoJoinRole) {
      console.error('The configured Auto Join role no longer exists in ' + guild.name + '.');
      await notifyOwner(guild, 'Auto Join could not assign the configured role because it no longer exists. Run /setup autojoin again to choose a role.');
    } else if (autoJoinRole.id === guild.id || autoJoinRole.managed || !autoJoinRole.editable) {
      await notifyOwner(guild, 'Auto Join could not assign ' + autoJoinRole.name + '. Give LikeyBot Manage Roles and move its highest role above that role, then run /setup autojoin again.');
    } else {
      try {
        await addedMember.roles.add(autoJoinRole, 'Configured server Auto Join role');
      } catch (error) {
        console.error('Could not assign the Auto Join role in ' + guild.name + ':', error.message);
        await notifyOwner(guild, "Auto Join could not assign " + autoJoinRole.name + " to " + addedMember.user.tag + ". Check LikeyBot's Manage Roles permission and role position.");
      }
    }
  }

  if (!addedMember.user.bot || !settings.antiNuke) return;

  // Give Discord a moment to write the bot-add audit log entry.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  let entry;
  try {
    const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 8 });
    entry = auditLogs.entries.find((item) =>
      item.target?.id === addedMember.id && Date.now() - item.createdTimestamp < 15000
    );
  } catch (error) {
    await notifyOwner(guild, 'Anti Nuke detected the new bot ' + addedMember.user.tag + ', but I could not check the audit log. Give LikeyBot the View Audit Log permission. No roles were removed.');
    console.error('Could not fetch bot-add audit logs:', error.message);
    return;
  }

  if (!entry || !entry.executor) {
    await notifyOwner(guild, 'Anti Nuke detected the new bot ' + addedMember.user.tag + ', but could not identify who added it. No roles were removed. Check my View Audit Log permission.');
    return;
  }

  const actorId = entry.executor.id;
  if (actorId === client.user.id || isWhitelisted(guild.id, actorId, guild.ownerId)) return;

  let actor;
  try {
    actor = await guild.members.fetch(actorId);
    await actor.roles.set([], 'Anti Nuke: an unwhitelisted user added a bot');
    await notifyOwner(
      guild,
      'Anti Nuke Protection punished ' + actor.user.tag + ' (' + actor.id + ') for adding the unwhitelisted bot ' +
      addedMember.user.tag + ' (' + addedMember.id + '). Their manageable roles were removed.'
    );
  } catch (error) {
    await notifyOwner(
      guild,
      'Anti Nuke detected that ' + entry.executor.tag + ' added the unwhitelisted bot ' + addedMember.user.tag +
      ', but I could not clear the user\'s roles. Check my Manage Roles permission and role position.'
    );
    console.error('Could not remove roles for the Anti Nuke actor:', error.message);
  }
});

function getAuditTargetName(entry, fallback) {
  const nameChange = entry.changes?.find((change) => change.key === 'name');
  return entry.target?.name || nameChange?.old || nameChange?.new || fallback;
}

function roleEntryHasAdministrator(entry) {
  if (entry.target?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  const permissionChange = entry.changes?.find((change) => change.key === 'permissions');
  if (permissionChange?.new == null) return false;
  try {
    return new PermissionsBitField(permissionChange.new).has(PermissionFlagsBits.Administrator);
  } catch {
    return false;
  }
}

function roleUpdateGrantedAdministrator(entry) {
  const permissionChange = entry.changes?.find((change) => change.key === 'permissions');
  if (!permissionChange || permissionChange.new == null) return false;
  try {
    const oldPermissions = new PermissionsBitField(permissionChange.old ?? '0');
    const newPermissions = new PermissionsBitField(permissionChange.new);
    return !oldPermissions.has(PermissionFlagsBits.Administrator) &&
      newPermissions.has(PermissionFlagsBits.Administrator);
  } catch {
    return false;
  }
}

async function findAdministratorRoleChanges(entry, guild) {
  const administratorChanges = [];
  for (const change of entry.changes || []) {
    if (change.key !== '$add' && change.key !== '$remove') continue;
    const changedRoles = Array.isArray(change.new) ? change.new : (Array.isArray(change.old) ? change.old : []);
    for (const changedRole of changedRoles) {
      let role = guild.roles.cache.get(changedRole.id);
      if (!role) role = await guild.roles.fetch(changedRole.id).catch(() => null);
      if (role?.permissions.has(PermissionFlagsBits.Administrator)) {
        administratorChanges.push({
          action: change.key === '$add' ? 'added' : 'removed',
          id: role.id,
          name: role.name || changedRole.name || 'unknown role',
        });
      }
    }
  }
  return administratorChanges;
}
client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
  const settings = getGuildSettings(guild.id);
  if (!settings.antiNuke) return;
  if (entry.executorId === client.user.id) return;

  let actionDescription;
  let roleToRemoveId = null;
  let whitelistAction = null;
  let affectedMember = null;
  let administratorRolesToRemove = [];
  if (entry.action === AuditLogEvent.ChannelCreate) {
    whitelistAction = 'creatingChannel';
    const name = getAuditTargetName(entry, 'unknown channel');
    actionDescription = 'created channel #' + name + ' (' + (entry.targetId || 'unknown ID') + ')';
  } else if (entry.action === AuditLogEvent.ChannelDelete) {
    whitelistAction = 'deletingChannel';
    const name = getAuditTargetName(entry, 'unknown channel');
    actionDescription = 'deleted channel #' + name + ' (' + (entry.targetId || 'unknown ID') + ')';
  } else if (entry.action === AuditLogEvent.RoleDelete) {
    whitelistAction = 'deletingRole';
    const name = getAuditTargetName(entry, 'unknown role');
    actionDescription = 'deleted role ' + name + ' (' + (entry.targetId || 'unknown ID') + ')';
  } else if (entry.action === AuditLogEvent.RoleCreate) {
    const name = getAuditTargetName(entry, 'unknown role');
    const hasAdministratorPermission = roleEntryHasAdministrator(entry);
    whitelistAction = hasAdministratorPermission ? 'makingRoleWithAdmin' : 'creatingRole';
    actionDescription = 'created role ' + name + (hasAdministratorPermission ? ' with Administrator permission' : '') + ' (' + (entry.targetId || 'unknown ID') + ')';
    if (hasAdministratorPermission) roleToRemoveId = entry.targetId || entry.target?.id || null;
  } else if (entry.action === AuditLogEvent.MemberRoleUpdate) {
    whitelistAction = 'givingAdminRole';
    const administratorChanges = await findAdministratorRoleChanges(entry, guild);
    if (administratorChanges.length === 0) return;
    if (entry.targetId) affectedMember = await guild.members.fetch(entry.targetId).catch(() => null);
    administratorRolesToRemove = administratorChanges
      .filter((change) => change.action === 'added')
      .map((change) => change.id);
    const affectedLabel = affectedMember ? affectedMember.user.tag + ' (' + affectedMember.id + ')' : (entry.targetId || 'unknown member');
    actionDescription = administratorChanges.map((change) =>
      change.action + ' Administrator role ' + change.name + ' ' +
      (change.action === 'added' ? 'to ' : 'from ') + affectedLabel
    ).join('; ');
  } else {
    return;
  }

  const executorId = entry.executorId || entry.executor?.id;
  if (!executorId || executorId === client.user.id) return;
  const executorMember = await guild.members.fetch(executorId).catch(() => null);
  if (isWhitelistedForAction(guild.id, executorId, guild.ownerId, whitelistAction, executorMember)) return;

  let roleRemovalNote = '';
  if (administratorRolesToRemove.length > 0 && !affectedMember) {
    roleRemovalNote += ' I could not fetch the affected member to remove the assigned Administrator role.';
  }
  if (administratorRolesToRemove.length > 0 && affectedMember &&
      affectedMember.id !== guild.ownerId && affectedMember.id !== client.user.id) {
    for (const administratorRoleId of administratorRolesToRemove) {
      try {
        const role = await guild.roles.fetch(administratorRoleId).catch(() => null);
        if (!role || !affectedMember.roles.cache.has(role.id)) continue;
        await affectedMember.roles.remove(role, 'Anti Nuke: role assigned by an unwhitelisted user');
        roleRemovalNote += ' The Administrator role ' + role.name + ' was removed from ' +
          affectedMember.user.tag + ' (' + affectedMember.id + ').';
      } catch (error) {
        roleRemovalNote += ' I could not remove the Administrator role ' + administratorRoleId +
          ' from the affected member: ' + error.message;
      }
    }
  }
  if (roleToRemoveId) {
    try {
      const createdRole = await guild.roles.fetch(roleToRemoveId);
      if (createdRole && createdRole.editable) {
        await createdRole.delete('Anti Nuke: unwhitelisted user created an Administrator role');
        roleRemovalNote = ' The new Administrator role was also deleted.';
      } else if (createdRole) {
        roleRemovalNote = ' I could not delete the new Administrator role because it is above my role or I lack Manage Roles.';
      }
    } catch (error) {
      roleRemovalNote = ' I could not delete the new Administrator role: ' + error.message;
    }
  }

  let actor;
  try {
    actor = executorMember || await guild.members.fetch(executorId);
    await actor.roles.set([], 'Anti Nuke: unwhitelisted destructive action');
    await notifyOwner(
      guild,
      'Anti Nuke Protection punished ' + actor.user.tag + ' (' + actor.id + ') because they ' + actionDescription +
      '. Their manageable roles were removed.' + roleRemovalNote
    );
  } catch (error) {
    const actorLabel = actor ? actor.user.tag + ' (' + actor.id + ')' : (entry.executor?.tag || executorId);
    await notifyOwner(
      guild,
      'Anti Nuke detected that ' + actorLabel + ' ' + actionDescription +
      ', but I could not remove their roles. Check my Manage Roles permission and role position.' + roleRemovalNote
    );
    console.error('Could not punish the Anti Nuke actor:', error.message);
  }
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  const guild = newRole.guild;
  const settings = getGuildSettings(guild.id);
  if (!settings.antiNuke ||
      oldRole.permissions.has(PermissionFlagsBits.Administrator) ||
      !newRole.permissions.has(PermissionFlagsBits.Administrator)) return;

  // The role update event is authoritative for the permission change. Wait briefly
  // for Discord to make the matching audit-log entry available before identifying the actor.
  await new Promise((resolve) => setTimeout(resolve, 750));
  let entry;
  try {
    const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 8 });
    entry = auditLogs.entries.find((item) =>
      item.targetId === newRole.id &&
      Date.now() - item.createdTimestamp < 15000 &&
      roleUpdateGrantedAdministrator(item)
    );
  } catch (error) {
    await notifyOwner(guild, 'Anti Nuke detected Administrator permission being enabled on role ' + newRole.name + ', but could not identify who changed it. Give LikeyBot the View Audit Log permission.');
    console.error('Could not fetch role-update audit logs:', error.message);
    return;
  }

  const executorId = entry?.executorId || entry?.executor?.id;
  if (!entry || !executorId) {
    await notifyOwner(guild, 'Anti Nuke detected Administrator permission being enabled on role ' + newRole.name + ', but could not identify who changed it. Check LikeyBot\'s View Audit Log permission.');
    return;
  }
  if (executorId === client.user.id) return;
  const executorMember = await guild.members.fetch(executorId).catch(() => null);
  if (isWhitelistedForAction(guild.id, executorId, guild.ownerId, 'makingRoleWithAdmin', executorMember)) return;

  let roleNote = '';
  try {
    const currentRole = await guild.roles.fetch(newRole.id).catch(() => null);
    if (currentRole?.permissions.has(PermissionFlagsBits.Administrator)) {
      if (currentRole.editable) {
        await currentRole.setPermissions(
          currentRole.permissions.remove(PermissionFlagsBits.Administrator),
          'Anti Nuke: revoke Administrator permission granted by an unwhitelisted user',
        );
        roleNote = ' Administrator permission was removed from role ' + currentRole.name + '.';
      } else {
        roleNote = ' I could not remove Administrator permission from role ' + currentRole.name + ' because it is above my role or I lack Manage Roles.';
      }
    }
  } catch (error) {
    roleNote = ' I could not remove Administrator permission from the role: ' + error.message;
  }

  let actor;
  try {
    actor = executorMember || await guild.members.fetch(executorId);
    await actor.roles.set([], 'Anti Nuke: an unwhitelisted user enabled Administrator permission on a role');
    await notifyOwner(
      guild,
      'Anti Nuke Protection punished ' + actor.user.tag + ' (' + actor.id + ') because they enabled Administrator permission on role ' +
      newRole.name + ' (' + newRole.id + '). Their manageable roles were removed.' + roleNote,
    );
  } catch (error) {
    const actorLabel = actor ? actor.user.tag + ' (' + actor.id + ')' : (entry.executor?.tag || executorId);
    await notifyOwner(
      guild,
      'Anti Nuke detected that ' + actorLabel + ' enabled Administrator permission on role ' + newRole.name +
      ', but could not remove their roles. Check my Manage Roles permission and role position.' + roleNote,
    );
    console.error('Could not punish the unwhitelisted role-update actor:', error.message);
  }
});
if (!token) {
  console.error('DISCORD_TOKEN is missing from the environment variables.');
  process.exit(1);
}

client.login(token);





