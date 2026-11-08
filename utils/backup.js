const fs = require('node:fs/promises');
const path = require('node:path');
const { DATA_DIR } = require('./dataDir');
const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const CONFIG_FILES = {
  guildSettings: 'guild-settings.json',
  prefixes: 'guild-prefixes.json',
  tickets: 'ticket-settings.json',
  logs: 'log-settings.json',
  leveling: 'leveling-settings.json',
  stats: 'server-stats.json',
  welcomer: 'welcomer-settings.json',
};
const pendingRestores = new Set();
const activeRestores = new Set();

function safeGuildId(guildId) {
  if (!/^\d{15,22}$/.test(guildId)) throw new Error('Invalid server ID.');
  return guildId;
}

async function readJson(file, fallback = {}) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function readGuildConfigs(guildId) {
  const result = {};
  for (const [key, name] of Object.entries(CONFIG_FILES)) {
    const data = await readJson(path.join(DATA_DIR, name));
    if (Object.prototype.hasOwnProperty.call(data, guildId)) {
      result[key] = key === 'stats' ? { enabled: data[guildId]?.enabled === true } : data[guildId];
    }
  }
  return result;
}

function serializeRole(role) {
  return {
    id: role.id, name: role.name, color: role.color, hoist: role.hoist,
    mentionable: role.mentionable, permissions: role.permissions.bitfield.toString(),
    position: role.position,
  };
}

function serializeChannel(channel) {
  const result = {
    id: channel.id, name: channel.name, type: channel.type, position: channel.rawPosition,
    parentId: channel.parentId || null,
    permissionOverwrites: [...channel.permissionOverwrites.cache.values()].map((entry) => ({
      id: entry.id, type: entry.type, allow: entry.allow.bitfield.toString(), deny: entry.deny.bitfield.toString(),
    })),
  };
  const properties = [
    'topic', 'nsfw', 'rateLimitPerUser', 'bitrate', 'userLimit', 'rtcRegion',
    'videoQualityMode', 'defaultAutoArchiveDuration', 'defaultThreadRateLimitPerUser',
    'defaultSortOrder', 'defaultForumLayout',
  ];
  for (const property of properties) if (channel[property] !== undefined && channel[property] !== null) result[property] = channel[property];
  if (channel.availableTags) result.availableTags = channel.availableTags.map((tag) => ({
    name: tag.name, moderated: tag.moderated,
    emojiId: tag.emojiId || null, emojiName: tag.emojiName || null,
  }));
  if (channel.defaultReactionEmoji) result.defaultReactionEmoji = {
    emojiId: channel.defaultReactionEmoji.emojiId || null,
    emojiName: channel.defaultReactionEmoji.emojiName || null,
  };
  return result;
}

async function createBackup(guild) {
  const guildId = safeGuildId(guild.id);
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const channels = [...guild.channels.cache.values()]
    .filter((channel) => !channel.isThread())
    .map(serializeChannel);
  const assets = {};
  const ticketSettings = (await readGuildConfigs(guildId)).tickets;
  const panels = ticketSettings?.panels || {};
  for (const panel of Object.values(panels)) {
    if (!panel.imageFile) continue;
    const filename = path.basename(panel.imageFile);
    if (!filename.startsWith(guildId)) continue;
    try {
      const bytes = await fs.readFile(path.join(DATA_DIR, 'ticket-panel-assets', filename));
      assets[filename] = bytes.toString('base64');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const welcomerSettings = (await readGuildConfigs(guildId)).welcomer;
  const welcomerAssets = {};
  if (welcomerSettings?.imageFile) {
    const filename = path.basename(welcomerSettings.imageFile);
    if (filename.startsWith(guildId + '-welcomer')) {
      try {
        const bytes = await fs.readFile(path.join(DATA_DIR, 'welcomer-assets', filename));
        welcomerAssets[filename] = bytes.toString('base64');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  const backup = {
    formatVersion: 1,
    guildId,
    guildName: guild.name,
    createdAt: new Date().toISOString(),
    guildSettings: {
      verificationLevel: guild.verificationLevel,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      explicitContentFilter: guild.explicitContentFilter,
      afkTimeout: guild.afkTimeout,
      afkChannelId: guild.afkChannelId,
      systemChannelId: guild.systemChannelId,
      rulesChannelId: guild.rulesChannelId,
      publicUpdatesChannelId: guild.publicUpdatesChannelId,
      systemChannelFlags: guild.systemChannelFlags?.bitfield?.toString(),
      preferredLocale: guild.preferredLocale,
      premiumProgressBarEnabled: guild.premiumProgressBarEnabled,
    },
    roles: [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.id && !role.managed)
      .map(serializeRole),
    channels,
    botSettings: await readGuildConfigs(guildId),
    ticketAssets: assets,
    welcomerAssets,
  };
  const file = path.join(BACKUP_DIR, guildId + '.json');
  const contents = JSON.stringify(backup, null, 2) + '\n';
  await fs.writeFile(file, contents, 'utf8');
  return { file, backup, size: Buffer.byteLength(contents) };
}

async function restoreGuildConfigs(guild, backup, roleMap, channelMap, statsApi) {
  for (const [key, filename] of Object.entries(CONFIG_FILES)) {
    if (key === 'stats') continue;
    const file = path.join(DATA_DIR, filename);
    const all = await readJson(file);
    if (!Object.prototype.hasOwnProperty.call(backup.botSettings || {}, key)) {
      delete all[guild.id];
    } else {
      const config = structuredClone(backup.botSettings[key]);
      if (key === 'guildSettings' && config.autoJoinRoleId) config.autoJoinRoleId = roleMap.get(config.autoJoinRoleId) || null;
      if (key === 'logs' && config.channelId) config.channelId = channelMap.get(config.channelId) || null;
      if (key === 'tickets') {
        for (const panel of Object.values(config.panels || {})) {
          if (panel.channelId) panel.channelId = channelMap.get(panel.channelId) || null;
        }
      }
      if (key === 'welcomer') {
        for (const field of ['categoryId', 'entranceChannelId', 'exitChannelId']) {
          if (config[field]) config[field] = channelMap.get(config[field]) || null;
        }
      }
      all[guild.id] = config;
    }
    await fs.writeFile(file, JSON.stringify(all, null, 2) + '\n', 'utf8');
  }

  const assetDir = path.join(DATA_DIR, 'ticket-panel-assets');
  await fs.mkdir(assetDir, { recursive: true });
  for (const [name, encoded] of Object.entries(backup.ticketAssets || {})) {
    const filename = path.basename(name);
    if (!filename.startsWith(guild.id + '-') && filename !== guild.id + '.jpg') continue;
    if (typeof encoded !== 'string' || encoded.length > 35_000_000) continue;
    await fs.writeFile(path.join(assetDir, filename), Buffer.from(encoded, 'base64'));
  }

  const welcomerAssetDir = path.join(DATA_DIR, 'welcomer-assets');
  await fs.mkdir(welcomerAssetDir, { recursive: true });
  for (const [name, encoded] of Object.entries(backup.welcomerAssets || {})) {
    const filename = path.basename(name);
    if (!filename.startsWith(guild.id + '-welcomer')) continue;
    if (typeof encoded !== 'string' || encoded.length > 35_000_000) continue;
    await fs.writeFile(path.join(welcomerAssetDir, filename), Buffer.from(encoded, 'base64'));
  }

  if (statsApi) {
    await statsApi.restoreStatsEnabled(guild.id, backup.botSettings?.stats?.enabled === true);
  }
}

function channelCreateOptions(channel, parentId, permissionOverwrites) {
  const options = { name: channel.name, type: channel.type, permissionOverwrites };
  if (parentId) options.parent = parentId;
  const copied = [
    'topic', 'nsfw', 'rateLimitPerUser', 'bitrate', 'userLimit', 'rtcRegion',
    'videoQualityMode', 'defaultAutoArchiveDuration', 'defaultThreadRateLimitPerUser',
    'availableTags', 'defaultReactionEmoji', 'defaultSortOrder', 'defaultForumLayout',
  ];
  for (const key of copied) if (channel[key] !== undefined) options[key] = channel[key];
  return options;
}

async function restoreBackup(guild, statsApi) {
  const guildId = safeGuildId(guild.id);
  const backup = await readJson(path.join(BACKUP_DIR, guildId + '.json'), null);
  if (!backup || backup.guildId !== guildId || backup.formatVersion !== 1) {
    throw new Error('No valid backup for this server was found. Run `/backup` first.');
  }
  if (!Array.isArray(backup.roles) || !Array.isArray(backup.channels)) throw new Error('The server backup file is incomplete.');

  const roleMap = new Map([[guildId, guildId]]);
  const channelMap = new Map();
  const failures = [];
  const roles = [...backup.roles].sort((a, b) => a.position - b.position);
  for (const role of roles) {
    try {
      const created = await guild.roles.create({
        name: String(role.name || 'Restored Role').slice(0, 100),
        color: Number(role.color) || 0,
        hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable),
        permissions: String(role.permissions || '0'), reason: 'Server owner requested backup restore',
      });
      roleMap.set(role.id, created.id);
    } catch (error) { failures.push('Role ' + String(role.name).slice(0, 80) + ': ' + error.message); }
  }
  const createdRoles = roles.filter((role) => roleMap.has(role.id));
  if (createdRoles.length) {
    try {
      await guild.roles.setPositions(createdRoles.map((role) => ({ role: roleMap.get(role.id), position: Math.max(1, role.position) })));
    } catch (error) { failures.push('Role positions: ' + error.message); }
  }

  const channels = [...backup.channels].sort((a, b) => {
    const ac = a.type === ChannelType.GuildCategory ? 0 : 1;
    const bc = b.type === ChannelType.GuildCategory ? 0 : 1;
    return ac - bc || a.position - b.position;
  });
  for (const channel of channels) {
    try {
      let parentId = channel.parentId ? channelMap.get(channel.parentId) : null;
      if (channel.parentId && !parentId) {
        failures.push('Channel ' + channel.name + ': its category could not be restored; created without it.');
      }
      const permissionOverwrites = [];
      for (const overwrite of channel.permissionOverwrites || []) {
        const mappedId = overwrite.type === 0
          ? (roleMap.get(overwrite.id) || null)
          : (overwrite.id === guildId ? guildId : overwrite.id);
        if (!mappedId) continue;
        permissionOverwrites.push({
          id: mappedId, type: overwrite.type,
          allow: String(overwrite.allow || '0'), deny: String(overwrite.deny || '0'),
        });
      }
      const created = await guild.channels.create(channelCreateOptions(channel, parentId, permissionOverwrites));
      channelMap.set(channel.id, created.id);
    } catch (error) { failures.push('Channel ' + String(channel.name).slice(0, 80) + ': ' + error.message); }
  }
  const channelsWithIds = backup.channels.filter((channel) => channelMap.has(channel.id));
  if (channelsWithIds.length) {
    try {
      await guild.channels.setPositions(channelsWithIds.map((channel) => ({ channel: channelMap.get(channel.id), position: channel.position })));
    } catch (error) { failures.push('Channel positions: ' + error.message); }
  }

  const settings = backup.guildSettings || {};
  const guildEdit = {};
  for (const key of ['verificationLevel', 'defaultMessageNotifications', 'explicitContentFilter', 'afkTimeout', 'preferredLocale', 'premiumProgressBarEnabled', 'systemChannelFlags']) {
    if (settings[key] !== undefined && settings[key] !== null) guildEdit[key] = settings[key];
  }
  for (const key of ['afkChannelId', 'systemChannelId', 'rulesChannelId', 'publicUpdatesChannelId']) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      guildEdit[key] = settings[key] ? (channelMap.get(settings[key]) || null) : null;
    }
  }
  if (Object.keys(guildEdit).length) {
    try { await guild.edit(guildEdit, 'Server owner requested backup restore'); }
    catch (error) { failures.push('Server settings: ' + error.message); }
  }

  try { await restoreGuildConfigs(guild, backup, roleMap, channelMap, statsApi); }
  catch (error) { failures.push('Bot settings: ' + error.message); }
  return { roles: roleMap.size - 1, channels: channelMap.size, failures };
}

function makeRestorePrompt(guildId, ownerId) {
  const nonce = crypto.randomBytes(6).toString('hex');
  const key = guildId + ':' + ownerId + ':' + nonce;
  pendingRestores.add(key);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('backup:restore:yes:' + key).setLabel('Restore Backup').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('backup:restore:no:' + key).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
  return {
    embeds: [new EmbedBuilder().setColor(0xFFFFFF).setDescription(
      'Are you sure you want to restore your data in this server? This will create duplicate roles and channels. Existing server content will not be deleted.',
    )],
    components: [row],
  };
}

async function handleBackupButton(interaction, statsApi) {
  if (!interaction.isButton() || !interaction.customId.startsWith('backup:restore:')) return false;
  const [namespace, action, choice, guildId, ownerId, nonce] = interaction.customId.split(':');
  const key = guildId + ':' + ownerId + ':' + nonce;
  if (interaction.guildId !== guildId || interaction.user.id !== ownerId || interaction.guild?.ownerId !== ownerId) {
    await interaction.reply({ content: 'Only this server\'s owner can use these restore buttons.', ephemeral: true });
    return true;
  }
  if (!pendingRestores.has(key)) {
    await interaction.reply({ content: 'This restore confirmation has expired or was already used.', ephemeral: true });
    return true;
  }
  if (choice === 'no') {
    pendingRestores.delete(key);
    await interaction.update({ content: 'Restore cancelled.', embeds: [], components: [] });
    return true;
  }
  if (choice !== 'yes') return false;
  if (activeRestores.has(guildId)) {
    await interaction.reply({ content: 'A restore is already running in this server.', ephemeral: true });
    return true;
  }
  pendingRestores.delete(key);
  activeRestores.add(guildId);
  await interaction.update({ content: 'Restoring this server backup. This may take a while.', embeds: [], components: [] });
  try {
    const result = await restoreBackup(interaction.guild, statsApi);
    const summary = 'Restore finished. Created ' + result.roles + ' roles and ' + result.channels + ' channels.';
    const details = result.failures.length
      ? '\n\nSome items could not be restored (' + result.failures.length + '):\n' + result.failures.slice(0, 8).map((failure) => '• ' + failure).join('\n')
      : '';
    await interaction.message.edit({ content: summary + details, components: [] }).catch(() => {});
  } catch (error) {
    await interaction.message.edit({ content: 'Restore failed: ' + error.message, components: [] }).catch(() => {});
  } finally { activeRestores.delete(guildId); }
  return true;
}

function canRestore(guild, member) {
  if (guild.ownerId !== member.id) return 'Only the server owner can use this command.';
  if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles) || !guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return 'I need Manage Roles and Manage Channels permissions to restore a backup.';
  }
  return null;
}

module.exports = { createBackup, makeRestorePrompt, handleBackupButton, canRestore };
