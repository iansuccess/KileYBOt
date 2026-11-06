const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder } = require('discord.js');

const LOG_SETTINGS_PATH = path.join(__dirname, '..', 'data', 'log-settings.json');
const LOG_COLOR = 0xFF0000;
const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(LOG_SETTINGS_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeSettings(settings) {
  fs.writeFileSync(LOG_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

function getLogChannelId(guildId) {
  return readSettings()[guildId]?.channelId || null;
}

function setLogChannel(guildId, channelId) {
  const settings = readSettings();
  settings[guildId] = { channelId };
  writeSettings(settings);
}

function shortText(value, limit = 1000) {
  if (!value) return '*No text*';
  return value.length > limit ? value.slice(0, limit - 3) + '...' : value;
}

function listAttachments(collection) {
  return collection ? [...collection.values()] : [];
}

async function sendMediaAttachments(channel, label, attachments) {
  if (attachments.length === 0) return;
  const copyable = attachments.filter((attachment) => attachment.url && attachment.size <= MAX_UPLOAD_SIZE);
  const tooLarge = attachments.filter((attachment) => attachment.size > MAX_UPLOAD_SIZE);

  for (let index = 0; index < copyable.length; index += 10) {
    const batch = copyable.slice(index, index + 10);
    try {
      await channel.send({
        content: label,
        files: batch.map((attachment) => ({
          attachment: attachment.url,
          name: attachment.name || 'attachment',
        })),
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      console.error('Could not copy a media attachment to the server log:', error.message);
      await channel.send({ content: label + '\nSome attachments could not be copied.', allowedMentions: { parse: [] } }).catch(() => {});
      return;
    }
  }

  if (tooLarge.length > 0) {
    const names = tooLarge.map((attachment) => attachment.name || 'attachment').join(', ');
    await channel.send({
      content: label + '\nCould not copy files over 25 MB: ' + names,
      allowedMentions: { parse: [] },
    }).catch(() => {});
  }
}

async function getLogChannel(guild) {
  const channelId = getLogChannelId(guild.id);
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
}

async function sendServerLog(guild, title, description, fields = [], attachments = []) {
  const channel = await getLogChannel(guild);
  if (!channel?.isTextBased() || !channel.send) return;

  const embed = new EmbedBuilder()
    .setColor(LOG_COLOR)
    .setTitle(shortText(title, 256))
    .setDescription(shortText(description, 4000))
    .setTimestamp();
  const safeFields = fields.slice(0, 25).map((field) => ({
    name: shortText(field.name, 256),
    value: shortText(field.value, 1000),
    inline: Boolean(field.inline),
  }));
  if (safeFields.length > 0) embed.addFields(safeFields);

  try {
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('Could not send a server log embed:', error.message);
    return;
  }

  if (attachments.length > 0) {
    await sendMediaAttachments(channel, 'Media attachments from the logged event:', attachments);
  }
}

async function sendMediaOnlyLog(guild, label, attachments) {
  const channel = await getLogChannel(guild);
  if (!channel?.isTextBased() || !channel.send) return;
  await sendMediaAttachments(channel, label, attachments);
}

module.exports = {
  getLogChannelId,
  setLogChannel,
  sendServerLog,
  sendMediaOnlyLog,
  listAttachments,
  shortText,
};
