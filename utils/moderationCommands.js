const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isWhitelisted } = require('./moderation');

const WRONG_EMOJI = '<:wrong:1567909557957558292>';
const CHECK_EMOJI = '<:check:1567896022028517416>';

function responseEmbed(color, text) {
  return new EmbedBuilder().setColor(color).setDescription(text);
}

function parseMemberAndReason(argsText) {
  const match = argsText.trim().match(/^(?:<@!?(\d{17,20})>|(\d{17,20}))(?:\s+([\s\S]+))?$/);
  if (!match) return null;
  return { userId: match[1] || match[2], reason: (match[3] || 'No reason provided.').trim().slice(0, 450) };
}

async function enforceWhitelist(message, actionName) {
  if (isWhitelisted(message.guild.id, message.author.id, message.guild.ownerId)) return true;

  let punishmentDetails = 'Their manageable roles were removed.';
  try {
    const member = message.member || await message.guild.members.fetch(message.author.id);
    await member.roles.set([], 'Anti Nuke: unwhitelisted user attempted ' + actionName);
  } catch (error) {
    punishmentDetails = 'I could not remove their manageable roles: ' + error.message;
    console.error('Could not punish an unwhitelisted ' + actionName + ' command user:', error.message);
  }

  const notice = 'Anti Nuke Protection blocked ' + message.author.tag + ' (' + message.author.id +
    ') for attempting the ' + actionName + ' command without being whitelisted. ' + punishmentDetails;
  await message.reply({
    embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' You are not whitelisted to use this moderation command. Anti Nuke Protection blocked it. ' + punishmentDetails)],
  }).catch(() => {});

  const owner = await message.guild.fetchOwner().catch(() => null);
  if (owner) {
    const delivered = await owner.send(notice).then(() => true).catch(() => false);
    if (!delivered && message.guild.systemChannel) {
      await message.guild.systemChannel.send(notice).catch(() => {});
    }
  } else if (message.guild.systemChannel) {
    await message.guild.systemChannel.send(notice).catch(() => {});
  }

  return false;
}

function actorIsAdministrator(message) {
  return message.author.id === message.guild.ownerId ||
    Boolean(message.member?.permissions?.has(PermissionFlagsBits.Administrator));
}

async function getTargetMember(message, userId) {
  return message.guild.members.fetch(userId).catch(() => null);
}

function successEmbed(text) {
  return responseEmbed(0x57F287, CHECK_EMOJI + ' ' + text);
}

module.exports = {
  WRONG_EMOJI,
  responseEmbed,
  parseMemberAndReason,
  enforceWhitelist,
  actorIsAdministrator,
  getTargetMember,
  successEmbed,
};
