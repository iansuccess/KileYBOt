const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { DATA_DIR } = require('./dataDir');
const {
  AttachmentBuilder,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const SETTINGS_PATH = path.join(DATA_DIR, 'welcomer-settings.json');
const ASSET_DIR = path.join(DATA_DIR, 'welcomer-assets');
const DEFAULT_IMAGE_PATH = path.join(__dirname, '..', 'assets', 'welcomeexit.png');
const ALLOWED_TYPES = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
]);

function readAllSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

function getWelcomerSettings(guildId) {
  return readAllSettings()[guildId] || null;
}

function saveWelcomerSettings(guildId, settings) {
  const allSettings = readAllSettings();
  allSettings[guildId] = settings;
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(allSettings, null, 2) + '\n', 'utf8');
}

function createCategoryOverwrites(guild) {
  const overwrites = [
    {
      id: guild.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessagesInThreads],
    },
  ];
  const botMember = guild.members.me;
  if (botMember) {
    overwrites.push({
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }
  const privilegedRoles = [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.id && !role.managed && (
      role.permissions.has(PermissionFlagsBits.Administrator) ||
      role.permissions.has(PermissionFlagsBits.ManageMessages) ||
      role.permissions.has(PermissionFlagsBits.ManageChannels)
    ))
    .slice(0, 90);
  for (const role of privilegedRoles) {
    overwrites.push({
      id: role.id,
      allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }
  return overwrites;
}

async function setupWelcomer(guild) {
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels) ||
      !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('I need Manage Channels and Manage Roles permissions to set up the welcomer channels.');
  }
  const allSettings = readAllSettings();
  let settings = allSettings[guild.id] || {
    categoryId: null,
    entranceChannelId: null,
    exitChannelId: null,
    imageFile: null,
  };
  let category = settings.categoryId ? guild.channels.cache.get(settings.categoryId) : null;
  if (!category || category.type !== ChannelType.GuildCategory) {
    category = guild.channels.cache.find((channel) =>
      channel.type === ChannelType.GuildCategory && channel.name === 'Лайк Portal'
    ) || null;
  }
  if (!category) {
    category = await guild.channels.create({
      name: 'Лайк Portal',
      type: ChannelType.GuildCategory,
      permissionOverwrites: createCategoryOverwrites(guild),
      reason: 'Set up LikeyBot member welcome and exit channels',
    });
  } else {
    await category.permissionOverwrites.set(
      createCategoryOverwrites(guild),
      'Apply read-only permissions for the LikeyBot welcomer category',
    );
  }
  settings = { ...settings, categoryId: category.id };
  saveWelcomerSettings(guild.id, settings);

  let entrance = settings.entranceChannelId ? guild.channels.cache.get(settings.entranceChannelId) : null;
  if (!entrance || entrance.type !== ChannelType.GuildText || entrance.parentId !== category.id) {
    entrance = guild.channels.cache.find((channel) =>
      channel.type === ChannelType.GuildText && channel.parentId === category.id && channel.name === 'Лайк Entrance'
    ) || null;
  }
  if (!entrance) {
    entrance = await guild.channels.create({
      name: 'Лайк Entrance',
      type: ChannelType.GuildText,
      parent: category.id,
      reason: 'Set up LikeyBot member welcome channel',
    });
  }
  await entrance.lockPermissions();
  settings = { ...settings, entranceChannelId: entrance.id };
  saveWelcomerSettings(guild.id, settings);

  let exit = settings.exitChannelId ? guild.channels.cache.get(settings.exitChannelId) : null;
  if (!exit || exit.type !== ChannelType.GuildText || exit.parentId !== category.id) {
    exit = guild.channels.cache.find((channel) =>
      channel.type === ChannelType.GuildText && channel.parentId === category.id && channel.name === 'Лайк Exit'
    ) || null;
  }
  if (!exit) {
    exit = await guild.channels.create({
      name: 'Лайк Exit',
      type: ChannelType.GuildText,
      parent: category.id,
      reason: 'Set up LikeyBot member exit channel',
    });
  }
  await exit.lockPermissions();
  settings = { ...settings, exitChannelId: exit.id };
  saveWelcomerSettings(guild.id, settings);
  return { category, entrance, exit };
}

async function saveWelcomerImage(guildId, attachment) {
  const contentType = (attachment.contentType || '').split(';')[0].toLowerCase();
  const extension = ALLOWED_TYPES.get(contentType) || path.extname(attachment.name || '').toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(extension) ||
      (contentType && !ALLOWED_TYPES.has(contentType))) {
    throw new Error('Choose a PNG, JPG, GIF, or WEBP image. Videos and other file types are not supported.');
  }
  if (attachment.size > 10 * 1024 * 1024) throw new Error('The image must be 10 MB or smaller.');

  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error('I could not download the selected image.');
  const responseType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!ALLOWED_TYPES.has(responseType)) throw new Error('The selected attachment is not a supported image. Videos are not supported.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 10 * 1024 * 1024) throw new Error('The image must be 10 MB or smaller.');

  const settings = getWelcomerSettings(guildId);
  if (!settings?.entranceChannelId || !settings?.exitChannelId) {
    throw new Error('Run `/setup welcomer setup` before editing its image.');
  }
  await fsp.mkdir(ASSET_DIR, { recursive: true });
  const safeExtension = responseType === 'image/jpeg' ? '.jpg' : ALLOWED_TYPES.get(responseType);
  const fileName = guildId + '-welcomer' + safeExtension;
  const previousFile = settings.imageFile;
  await fsp.writeFile(path.join(ASSET_DIR, fileName), buffer);
  saveWelcomerSettings(guildId, { ...settings, imageFile: fileName });
  if (previousFile && previousFile !== fileName) {
    await fsp.unlink(path.join(ASSET_DIR, path.basename(previousFile))).catch(() => {});
  }
  return fileName;
}

function getImage(guildId, settings) {
  if (settings?.imageFile) {
    const fileName = path.basename(settings.imageFile);
    if (fileName.startsWith(guildId + '-welcomer')) {
      const customPath = path.join(ASSET_DIR, fileName);
      if (fs.existsSync(customPath)) return { path: customPath, name: fileName };
    }
  }
  if (fs.existsSync(DEFAULT_IMAGE_PATH)) return { path: DEFAULT_IMAGE_PATH, name: 'welcomeexit.png' };
  return null;
}

async function sendMemberCard(member, kind) {
  const guild = member.guild;
  const settings = getWelcomerSettings(guild.id);
  const channelId = kind === 'entry' ? settings?.entranceChannelId : settings?.exitChannelId;
  if (!channelId) {
    console.warn('Welcomer is not configured for server ' + guild.id + ' (' + guild.name + ').');
    return false;
  }
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch((error) => {
    console.error('Could not find the configured welcomer channel ' + channelId + ' in ' + guild.name + ':', error.message);
    return null;
  });
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    console.error('The configured welcomer channel ' + channelId + ' is missing or is not a text channel in ' + guild.name + '.');
    return false;
  }

  const leaving = kind === 'exit';
  const position = leaving ? guild.memberCount + 1 : guild.memberCount;
  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle('Лайк Portal')
    .addFields(
      { name: leaving ? 'Exit' : 'Entry', value: '<@' + member.id + '>' },
      { name: 'Position', value: String(Math.max(1, position)) },
    )
    .setTimestamp();
  const icon = guild.iconURL({ extension: 'png', size: 256 });
  if (icon) embed.setThumbnail(icon);

  const image = getImage(guild.id, settings);
  const payload = { embeds: [embed], allowedMentions: { parse: [] } };
  if (image) {
    embed.setImage('attachment://' + image.name);
    payload.files = [new AttachmentBuilder(image.path, { name: image.name })];
  }
  const botMember = guild.members.me;
  const requiredPermissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
  if (image) requiredPermissions.push(PermissionFlagsBits.AttachFiles);
  if (!botMember || !channel.permissionsFor(botMember)?.has(requiredPermissions)) {
    console.error('LikeyBot lacks View Channel, Send Messages, Embed Links, or Attach Files in welcomer channel ' + channel.id + ' (' + guild.name + ').');
    return false;
  }
  try {
    await channel.send(payload);
    return true;
  } catch (error) {
    console.error('Could not send a welcomer card in ' + guild.name + ':', error.message);
    return false;
  }
}

module.exports = { setupWelcomer, saveWelcomerImage, sendMemberCard, getWelcomerSettings };
