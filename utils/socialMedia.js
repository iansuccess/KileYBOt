const fs = require('node:fs');
const path = require('node:path');
const { getPrefix } = require('./prefixes');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const SOCIAL_MEDIA_PATH = path.join(__dirname, '..', 'data', 'social-media.json');
const PLATFORM_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};
const PLATFORM_COMMANDS = {
  ig: 'instagram',
  fb: 'facebook',
  yt: 'youtube',
  tt: 'tiktok',
};

function readAll() {
  try { return JSON.parse(fs.readFileSync(SOCIAL_MEDIA_PATH, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

function getSocialMediaEntries(guildId) {
  const entries = readAll()[guildId] || {};
  return Object.entries(entries).map(([key, entry]) => ({
    ...entry,
    panelName: entry.panelName || entry.name || key,
  })).sort((a, b) => a.panelName.localeCompare(b.panelName));
}

function normalizePanelName(name) {
  return String(name || '').trim().toLowerCase();
}

function validateEntry(panelName, platform, link, existingEntries, currentPanelName = null) {
  const displayedPanelName = String(panelName || '').trim();
  const normalizedName = normalizePanelName(displayedPanelName);
  if (!displayedPanelName || displayedPanelName.length > 80 || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(displayedPanelName)) {
    throw new Error('Panel name must start with a letter or number and use only letters, numbers, spaces, underscores, or hyphens (up to 80 characters).');
  }
  if (['__proto__', 'constructor', 'prototype'].includes(normalizedName)) throw new Error('Choose a different panel name.');
  if (!PLATFORM_LABELS[platform]) throw new Error('Choose Instagram, Facebook, YouTube, or TikTok.');
  if (typeof link !== 'string' || link.trim().length > 500) throw new Error('Provide a social media link up to 500 characters.');
  try {
    const url = new URL(link.trim().replaceAll('{username}', 'username'));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
  } catch {
    throw new Error('Provide a valid HTTP or HTTPS link. You can include `{username}` where the account name should go.');
  }
  const duplicate = existingEntries.find((entry) =>
    normalizePanelName(entry.panelName || entry.name) === normalizedName && normalizePanelName(entry.panelName || entry.name) !== currentPanelName,
  );
  if (duplicate) throw new Error('A panel with that name already exists in this server. Choose another panel name.');
  return { panelName: displayedPanelName, platform, link: link.trim() };
}

function writeAll(data) {
  fs.mkdirSync(path.dirname(SOCIAL_MEDIA_PATH), { recursive: true });
  fs.writeFileSync(SOCIAL_MEDIA_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function addSocialMediaEntry(guildId, entry) {
  const all = readAll();
  const existingEntries = Object.values(all[guildId] || {});
  if (existingEntries.length >= 25) throw new Error('This server already has 25 social media panels.');
  const saved = validateEntry(entry.panelName, entry.platform, entry.link, existingEntries);
  if (!all[guildId]) all[guildId] = {};
  all[guildId][normalizePanelName(saved.panelName)] = saved;
  writeAll(all);
  return saved;
}

function editSocialMediaEntry(guildId, currentPanelName, changes) {
  const all = readAll();
  const entries = all[guildId] || {};
  const currentKey = normalizePanelName(currentPanelName);
  const existingKey = Object.keys(entries).find((key) =>
    normalizePanelName(entries[key].panelName || entries[key].name || key) === currentKey,
  );
  const existing = existingKey ? entries[existingKey] : null;
  if (!existing) throw new Error('That social media entry no longer exists. Run `/setup socialmedia` to add it again.');
  const candidate = validateEntry(
    changes.panelName || existing.panelName || existing.name || existingKey,
    changes.platform || existing.platform,
    changes.link || existing.link,
    Object.values(entries).map((entry) => ({ ...entry, panelName: entry.panelName || entry.name })),
    currentKey,
  );
  delete entries[existingKey];
  entries[normalizePanelName(candidate.panelName)] = candidate;
  all[guildId] = entries;
  writeAll(all);
  return candidate;
}

function hasSocialMediaAdminAccess(message) {
  return message.author.id === message.guild.ownerId ||
    message.member?.permissions.has(PermissionFlagsBits.Administrator);
}

function getConfiguredAccountName(entry) {
  try {
    const url = new URL(entry.link.replaceAll('{username}', ''));
    const segments = url.pathname.split('/').filter(Boolean);
    const lastSegment = segments.at(-1) || '';
    if (lastSegment.startsWith('@')) return decodeURIComponent(lastSegment.slice(1));
    return decodeURIComponent(lastSegment);
  } catch {
    return '';
  }
}

async function getYouTubeStats(handle) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { available: false, message: 'YouTube API key is not configured.' };
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet,statistics');
  url.searchParams.set('forHandle', handle.startsWith('@') ? handle : '@' + handle);
  url.searchParams.set('key', apiKey);
  try {
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || 'YouTube API request failed.');
    const channel = payload.items?.[0];
    if (!channel) return { available: false, message: 'No YouTube channel was found for that name.' };
    return {
      available: true,
      title: channel.snippet?.title || handle,
      subscribers: channel.statistics?.subscriberCount || '0',
      subscribersHidden: channel.statistics?.hiddenSubscriberCount === true,
    };
  } catch (error) {
    console.error('Could not fetch YouTube channel statistics:', error.message);
    return { available: false, message: 'YouTube statistics could not be loaded.' };
  }
}

function hasSocialMediaInteractionAccess(interaction) {
  return interaction.user.id === interaction.guild?.ownerId ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function makeAnotherPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('socialmedia_make_another')
      .setLabel('Make Another')
      .setStyle(ButtonStyle.Secondary),
  );
}

async function handleSocialMediaButton(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'socialmedia_make_another') return false;
  if (!hasSocialMediaInteractionAccess(interaction)) {
    await interaction.reply({ content: 'Only the server owner or an administrator can add social media panels.', ephemeral: true });
    return true;
  }
  const modal = new ModalBuilder()
    .setCustomId('socialmedia_make_another_modal')
    .setTitle('Make Another Social Media Panel')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('platform')
        .setLabel('Platform (instagram/facebook/youtube/tiktok)')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(12)
        .setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('link')
        .setLabel('Profile link; {username} is optional')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(500)
        .setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder()
        .setCustomId('panel_name')
        .setLabel('Fresh panel name')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(80)
        .setRequired(true)),
    );
  await interaction.showModal(modal);
  return true;
}

async function handleSocialMediaModal(interaction) {
  if (!interaction.isModalSubmit() || interaction.customId !== 'socialmedia_make_another_modal') return false;
  if (!hasSocialMediaInteractionAccess(interaction)) {
    await interaction.reply({ content: 'Only the server owner or an administrator can add social media panels.', ephemeral: true });
    return true;
  }
  const platform = interaction.fields.getTextInputValue('platform').trim().toLowerCase();
  const link = interaction.fields.getTextInputValue('link').trim();
  const panelName = interaction.fields.getTextInputValue('panel_name').trim();
  try {
    const entry = addSocialMediaEntry(interaction.guild.id, { platform, link, panelName });
    await interaction.reply({
      content: PLATFORM_LABELS[entry.platform] + ' panel **' + entry.panelName + '** was added. Run `' + getPrefix(interaction.guild.id) + Object.keys(PLATFORM_COMMANDS).find((name) => PLATFORM_COMMANDS[name] === entry.platform) + ' ' + entry.panelName + '` to use it.',
      components: [makeAnotherPanelRow()],
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({ content: 'I could not save that social media panel. ' + error.message, ephemeral: true });
  }
  return true;
}

async function handleSocialMediaCommand(message, commandName, argsText, currentPrefix = ',') {
  const platform = PLATFORM_COMMANDS[commandName];
  if (!platform) return false;
  if (!hasSocialMediaAdminAccess(message)) return true;

  const platformEntries = getSocialMediaEntries(message.guild.id).filter((entry) => entry.platform === platform);
  if (!platformEntries.length) return false;
  const requestedPanelName = argsText.trim();
  if (!requestedPanelName) {
    const names = platformEntries.map((item) => '`' + item.panelName + '`').join(', ');
    await message.reply('Use `' + currentPrefix + commandName + ' panel name`. Available panels: ' + names + '.');
    return true;
  }
  const entry = platformEntries.find((item) => normalizePanelName(item.panelName) === normalizePanelName(requestedPanelName));
  if (!entry) {
    await message.reply({
      embeds: [new EmbedBuilder().setDescription('<:wrong:1567909557957558292> i cant find it in panel.')],
    });
    return true;
  }

  const profileUser = message.author;
  const accountName = getConfiguredAccountName(entry);

  let details;
  if (platform === 'youtube' && accountName) {
    const stats = await getYouTubeStats(accountName);
    details = stats.available
      ? '**' + stats.title + '**\nSubscribers: ' + (stats.subscribersHidden ? 'Hidden' : stats.subscribers)
      : '**YouTube**\nSubscribers: Not available (' + stats.message + ')';
  } else if (platform === 'instagram' || platform === 'tiktok') {
    details = '**Followers:** <a:P_black_diamond:1568671681499897917>' +
      '\n**Following:** <a:P_black_diamond:1568671681499897917>' +
      '\n**Likes:** <a:P_black_diamond:1568671681499897917>' +
      '\n**Status:** <:check:1567896022028517416> active';
  } else {
    details = '**' + PLATFORM_LABELS[platform] + '**\nAccount: ' + accountName;
  }
  const embed = new EmbedBuilder()
    .setTitle('Social Media')
    .setDescription('<@' + profileUser.id + '>\n\n' + details)
    .setThumbnail(profileUser.displayAvatarURL({ extension: 'png', size: 256 }));

  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Open ' + PLATFORM_LABELS[platform])
      .setURL(entry.link.replaceAll('{username}', '')),
  );
  await message.channel.send({ embeds: [embed], components: [buttonRow], allowedMentions: { parse: [] } });
  return true;
}

module.exports = {
  PLATFORM_LABELS,
  getSocialMediaEntries,
  addSocialMediaEntry,
  editSocialMediaEntry,
  handleSocialMediaCommand,
  makeAnotherPanelRow,
  handleSocialMediaButton,
  handleSocialMediaModal,
};
