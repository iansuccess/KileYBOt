const fs = require('node:fs');
const path = require('node:path');
const { ChannelType } = require('discord.js');
const { DATA_DIR } = require('./dataDir');

function backupFile(guildId) {
  return path.join(DATA_DIR, 'channel-backups-' + guildId + '.json');
}

function readBackups(guildId) {
  try {
    return JSON.parse(fs.readFileSync(backupFile(guildId), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeBackups(guildId, backups) {
  const file = backupFile(guildId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporaryFile = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporaryFile, JSON.stringify(backups, null, 2) + '\n', 'utf8');
  fs.renameSync(temporaryFile, file);
}

function replaceId(value, oldId, newId) {
  if (typeof value === 'string') return value === oldId ? newId : value;
  if (Array.isArray(value)) return value.map((item) => replaceId(item, oldId, newId));
  if (!value || typeof value !== 'object') return value;
  const replaced = {};
  for (const [key, item] of Object.entries(value)) {
    replaced[key === oldId ? newId : key] = replaceId(item, oldId, newId);
  }
  return replaced;
}

function remapGuildChannelReferences(guildId, oldId, newId) {
  const files = [
    'autoreact-settings.json', 'server-ads.json', 'server-boosts.json',
    'ticket-settings.json', 'log-settings.json', 'welcomer-settings.json',
    'jail-settings.json', 'open-tickets.json', 'closed-tickets.json',
    'unauthorized-catcher-settings.json',
  ];
  for (const fileName of files) {
    const file = path.join(DATA_DIR, fileName);
    let all;
    try {
      all = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!Object.prototype.hasOwnProperty.call(all, guildId)) continue;
    const originalGuildData = JSON.stringify(all[guildId]);
    const updatedGuildData = replaceId(all[guildId], oldId, newId);
    if (JSON.stringify(updatedGuildData) === originalGuildData) continue;
    all[guildId] = updatedGuildData;
    const temporaryFile = file + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporaryFile, JSON.stringify(all, null, 2) + '\n', 'utf8');
    fs.renameSync(temporaryFile, file);
  }
}

function serializeChannel(channel) {
  if (!channel.guild || channel.isThread?.()) return null;
  const snapshot = {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    position: channel.rawPosition,
    parentId: channel.parentId || null,
    permissionOverwrites: channel.permissionOverwrites
      ? [...channel.permissionOverwrites.cache.values()].map((overwrite) => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.toArray(),
        deny: overwrite.deny.toArray(),
      }))
      : [],
  };

  for (const key of [
    'topic', 'nsfw', 'rateLimitPerUser', 'bitrate', 'userLimit', 'rtcRegion',
    'videoQualityMode', 'defaultAutoArchiveDuration', 'defaultThreadRateLimitPerUser',
    'defaultSortOrder', 'defaultForumLayout',
  ]) {
    if (channel[key] !== undefined && channel[key] !== null) snapshot[key] = channel[key];
  }
  if (channel.availableTags) {
    snapshot.availableTags = channel.availableTags.map((tag) => ({
      name: tag.name,
      moderated: tag.moderated,
      emojiId: tag.emojiId || null,
      emojiName: tag.emojiName || null,
    }));
  }
  if (channel.defaultReactionEmoji) {
    snapshot.defaultReactionEmoji = {
      emojiId: channel.defaultReactionEmoji.emojiId || null,
      emojiName: channel.defaultReactionEmoji.emojiName || null,
    };
  }
  if (channel.type === ChannelType.GuildCategory) {
    snapshot.childChannels = [...channel.guild.channels.cache.values()]
      .filter((child) => child.parentId === channel.id && !child.isThread?.())
      .map((child) => ({ id: child.id, position: child.rawPosition }));
  }
  return snapshot;
}

function recordChannel(channel) {
  const snapshot = serializeChannel(channel);
  if (!snapshot) return;
  const backups = readBackups(channel.guild.id);
  backups[channel.id] = snapshot;
  writeBackups(channel.guild.id, backups);
}

function recordGuildChannels(guild) {
  const backups = readBackups(guild.id);
  for (const channel of guild.channels.cache.values()) {
    const snapshot = serializeChannel(channel);
    if (snapshot) backups[channel.id] = snapshot;
  }
  writeBackups(guild.id, backups);
}

function makeCreateOptions(snapshot, parentId = snapshot.parentId) {
  const options = {
    name: snapshot.name,
    type: snapshot.type,
    permissionOverwrites: snapshot.permissionOverwrites || [],
    parent: parentId && parentId !== snapshot.id ? parentId : null,
  };
  const keysByType = {
    [ChannelType.GuildText]: ['topic', 'nsfw', 'rateLimitPerUser', 'defaultAutoArchiveDuration', 'defaultThreadRateLimitPerUser'],
    [ChannelType.GuildAnnouncement]: ['topic', 'nsfw', 'rateLimitPerUser', 'defaultAutoArchiveDuration', 'defaultThreadRateLimitPerUser'],
    [ChannelType.GuildVoice]: ['bitrate', 'userLimit', 'rtcRegion', 'videoQualityMode'],
    [ChannelType.GuildStageVoice]: ['bitrate', 'rtcRegion', 'videoQualityMode'],
    [ChannelType.GuildForum]: ['topic', 'nsfw', 'rateLimitPerUser', 'defaultAutoArchiveDuration', 'defaultThreadRateLimitPerUser', 'availableTags', 'defaultReactionEmoji', 'defaultSortOrder', 'defaultForumLayout'],
    [ChannelType.GuildMedia]: ['topic', 'nsfw', 'rateLimitPerUser', 'defaultAutoArchiveDuration', 'defaultThreadRateLimitPerUser', 'availableTags', 'defaultReactionEmoji', 'defaultSortOrder', 'defaultForumLayout'],
  };
  for (const key of keysByType[snapshot.type] || []) {
    if (snapshot[key] !== undefined) options[key] = snapshot[key];
  }
  return options;
}

async function restoreDeletedChannel(guild, channelId) {
  const savedBackups = readBackups(guild.id);
  const snapshot = savedBackups[channelId];
  if (!snapshot) throw new Error('No saved channel backup was found for this server.');

  let parentId = snapshot.parentId;
  if (parentId && !guild.channels.cache.has(parentId)) parentId = null;
  const restored = await guild.channels.create(makeCreateOptions(snapshot, parentId));
  if (Number.isInteger(snapshot.position)) {
    await restored.setPosition(snapshot.position).catch((error) => {
      console.warn('Could not restore channel position for ' + restored.id + ':', error.message);
    });
  }

  if (snapshot.type === ChannelType.GuildCategory) {
    for (const childSnapshot of snapshot.childChannels || []) {
      const child = guild.channels.cache.get(childSnapshot.id);
      if (!child || child.isThread?.()) continue;
      await child.setParent(restored.id, { lockPermissions: false, reason: 'Restore channel after unauthorized category deletion' })
        .catch((error) => console.warn('Could not restore category placement for channel ' + child.id + ':', error.message));
      if (Number.isInteger(childSnapshot.position)) {
        await child.setPosition(childSnapshot.position).catch(() => {});
      }
    }
  }

  recordChannel(restored);
  const currentBackups = readBackups(guild.id);
  delete currentBackups[channelId];
  for (const savedChannel of Object.values(currentBackups)) {
    if (savedChannel.parentId === channelId) savedChannel.parentId = restored.id;
  }
  writeBackups(guild.id, currentBackups);
  try {
    remapGuildChannelReferences(guild.id, channelId, restored.id);
  } catch (error) {
    console.warn('Could not update saved feature references for restored channel ' + restored.id + ':', error.message);
  }
  return restored;
}

module.exports = { recordChannel, recordGuildChannels, restoreDeletedChannel };
