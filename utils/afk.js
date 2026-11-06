const fs = require('node:fs');
const path = require('node:path');

const AFK_PATH = path.join(__dirname, '..', 'data', 'afk-status.json');
const AFK_EMOJI = '<a:Afk:1568138597637292092>';
const AFK_MENTION_EMOJI = '<:afk:1568138347275100162>';

function readAfkData() {
  try {
    return JSON.parse(fs.readFileSync(AFK_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeAfkData(data) {
  fs.writeFileSync(AFK_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function getAfk(guildId, userId) {
  return readAfkData()[guildId]?.[userId] || null;
}

function setAfk(guildId, userId, reason) {
  const data = readAfkData();
  if (!data[guildId]) data[guildId] = {};
  data[guildId][userId] = { reason: reason || null, since: Date.now() };
  writeAfkData(data);
}

function clearAfk(guildId, userId) {
  const data = readAfkData();
  const status = data[guildId]?.[userId];
  if (!status) return null;
  delete data[guildId][userId];
  if (Object.keys(data[guildId]).length === 0) delete data[guildId];
  writeAfkData(data);
  return status;
}

function deleteAfterFiveSeconds(message) {
  const timer = setTimeout(() => message.delete().catch(() => {}), 5000);
  timer.unref?.();
}

async function handleAfkActivity(message, skipAuthorReset = false) {
  if (!skipAuthorReset) {
    const previousStatus = clearAfk(message.guild.id, message.author.id);
    if (previousStatus) {
      const returnNotice = await message.reply({
        content: 'You are finally back. I\'m removing your AFK.',
        allowedMentions: { repliedUser: false, parse: [] },
      }).catch(() => null);
      if (returnNotice) deleteAfterFiveSeconds(returnNotice);
    }
  }

  for (const member of message.mentions.members?.values() || []) {
    if (member.id === message.author.id) continue;
    if (!getAfk(message.guild.id, member.id)) continue;
    const afkNotice = await message.channel.send({
      content: AFK_MENTION_EMOJI + ' ' + member.toString() + ' was AFK',
      allowedMentions: { users: [] },
    }).catch(() => null);
    if (afkNotice) deleteAfterFiveSeconds(afkNotice);
  }
}

function containsDiscordInvite(text) {
  return /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i.test(text);
}

module.exports = { AFK_EMOJI, getAfk, setAfk, handleAfkActivity, containsDiscordInvite };
