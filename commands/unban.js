const { PermissionFlagsBits } = require('discord.js');
const {
  WRONG_EMOJI,
  responseEmbed,
  enforceWhitelist,
  actorIsAdministrator,
  successEmbed,
} = require('../utils/moderationCommands');

module.exports = {
  type: 'message',
  name: 'unban',
  async execute({ message, argsText, currentPrefix }) {
    if (!actorIsAdministrator(message)) return;
    if (!(await enforceWhitelist(message, 'unban'))) return;

    const match = argsText.trim().match(/^(\d{17,20})(?:\s+([\s\S]+))?$/);
    if (!match) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' Use `' + currentPrefix + 'unban <user ID> [reason]`.')] });
      return;
    }

    const botMember = message.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' I need the Ban Members permission to unban users.')] });
      return;
    }

    const userId = match[1];
    const reason = (match[2] || 'No reason provided.').trim().slice(0, 450);
    try {
      await message.guild.bans.remove(userId, reason + ' | Requested by ' + message.author.tag);
      await message.reply({ embeds: [successEmbed('Successfully unbanned user ID `' + userId + '` by ' + message.author.toString() + '.')] });
    } catch (error) {
      console.error('Unban command failed:', error.message);
      const description = error.code === 10026
        ? WRONG_EMOJI + ' That user ID is not banned in this server.'
        : WRONG_EMOJI + ' I could not unban that user. Check my Ban Members permission.';
      await message.reply({ embeds: [responseEmbed(0xED4245, description)] });
    }
  },
};
