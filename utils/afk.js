const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./dataDir');
const { EmbedBuilder } = require('discord.js');

const AFK_PATH = path.join(DATA_DIR, 'afk-status.json');
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

function setAfk(guildId, userId, reason, nickname = null) {
  const data = readAfkData();
  if (!data[guildId]) data[guildId] = {};
  data[guildId][userId] = { reason: reason || null, nickname, since: Date.now() };
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
      const member = message.member;
      if (member?.manageable) {
        const originalNickname = Object.prototype.hasOwnProperty.call(previousStatus, 'nickname')
          ? previousStatus.nickname
          : (member.nickname?.startsWith('[AFK] ') ? member.nickname.slice(6) : member.nickname);
        member.setNickname(originalNickname || null, 'Remove the AFK nickname tag after the member returned')
          .catch((error) => console.error('Could not remove the AFK nickname tag:', error.message));
      }
      const returnNotice = await message.reply({
        content: 'You are finally back. I\'m removing your AFK.',
        allowedMentions: { repliedUser: false, parse: [] },
      }).catch(() => null);
      if (returnNotice) deleteAfterFiveSeconds(returnNotice);
    }
  }

  const mentionedMembers = new Map(
    [...(message.mentions.members?.values() || [])].map((member) => [member.id, member]),
  );
  if (message.reference?.messageId) {
    const repliedUser = message.mentions.repliedUser;
    let repliedMember = repliedUser ? message.guild.members.cache.get(repliedUser.id) : null;
    if (!repliedMember) {
      const referencedMessage = await message.fetchReference().catch(() => null);
      if (referencedMessage) {
        repliedMember = message.guild.members.cache.get(referencedMessage.author.id) ||
          await message.guild.members.fetch(referencedMessage.author.id).catch(() => null);
      }
    }
    if (repliedMember) mentionedMembers.set(repliedMember.id, repliedMember);
  }

  for (const member of mentionedMembers.values()) {
    if (member.id === message.author.id) continue;
    const status = getAfk(message.guild.id, member.id);
    if (!status) continue;
    const afkNotice = await message.channel.send({
      embeds: [new EmbedBuilder()
        .setDescription(AFK_MENTION_EMOJI)
        .addFields(
          { name: 'Reason', value: status.reason ? String(status.reason).slice(0, 1024) : '**None**' },
          { name: 'Status', value: member.toString() + ' was AFK' },
        )
        .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 256 }))],
      allowedMentions: { users: [] },
    }).catch(() => null);
    if (afkNotice) deleteAfterFiveSeconds(afkNotice);
  }
}

function containsDiscordInvite(text) {
  return /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i.test(text);
}

module.exports = { AFK_EMOJI, getAfk, setAfk, handleAfkActivity, containsDiscordInvite };
