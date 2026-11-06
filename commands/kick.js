const { PermissionFlagsBits } = require('discord.js');
const {
  WRONG_EMOJI,
  responseEmbed,
  parseMemberAndReason,
  enforceWhitelist,
  actorIsAdministrator,
  getTargetMember,
  successEmbed,
} = require('../utils/moderationCommands');

module.exports = {
  type: 'message',
  name: 'kick',
  async execute({ message, argsText, currentPrefix }) {
    if (!actorIsAdministrator(message)) return;
    if (!(await enforceWhitelist(message, 'kick'))) return;

    const parsed = parseMemberAndReason(argsText);
    if (!parsed) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' Use `' + currentPrefix + 'kick @user [reason]`.')] });
      return;
    }
    if (parsed.userId === message.author.id) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' You cannot kick yourself.')] });
      return;
    }

    const target = await getTargetMember(message, parsed.userId);
    if (!target) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' I could not find that member in this server.')] });
      return;
    }
    if (target.id === message.guild.ownerId || target.id === message.client.user.id) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' The server owner and LikeyBot cannot be kicked.')] });
      return;
    }

    const botMember = message.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.KickMembers)) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' I need the Kick Members permission to do that.')] });
      return;
    }
    if (!target.kickable) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' I cannot kick that member. Move my highest role above their highest role and check my permissions.')] });
      return;
    }

    try {
      await target.kick(parsed.reason + ' | Requested by ' + message.author.tag);
      await message.reply({ embeds: [successEmbed('Successfully kicked ' + target.toString() + ' by ' + message.author.toString() + '.')] });
    } catch (error) {
      console.error('Kick command failed:', error.message);
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' I could not kick that member. Check my Kick Members permission and role position.')] });
    }
  },
};
