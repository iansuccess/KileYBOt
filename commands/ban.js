const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
  WRONG_EMOJI,
  responseEmbed,
  parseMemberAndReason,
  enforceWhitelist,
  actorIsAdministrator,
  getTargetMember,
} = require('../utils/moderationCommands');

module.exports = {
  type: 'message',
  name: 'ban',
  async execute({ message, argsText, currentPrefix }) {
    if (!actorIsAdministrator(message)) return;
    if (!(await enforceWhitelist(message, 'ban'))) return;

    const parsed = parseMemberAndReason(argsText);
    if (!parsed) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' Use `' + currentPrefix + 'ban @user [reason]`.')] });
      return;
    }
    if (parsed.userId === message.author.id) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' You cannot ban yourself.')] });
      return;
    }
    if (parsed.userId === message.guild.ownerId || parsed.userId === message.client.user.id) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' The server owner and LikeyBot cannot be banned.')] });
      return;
    }

    const target = await getTargetMember(message, parsed.userId);
    if (!target) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' I could not find that member in this server.')] });
      return;
    }

    const botMember = message.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' I need the Ban Members permission to do that.')] });
      return;
    }
    if (!target.bannable) {
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' I cannot ban that member. Check my Ban Members permission and role position.')] });
      return;
    }

    try {
      await target.ban({ reason: parsed.reason + ' | Requested by ' + message.author.tag });
      const successMessage = new EmbedBuilder()
        .setTitle('<:notify_1568670996767051947:1568671094058000536> New Notification')
        .setDescription('Successfully banned ' + target.toString() + ' by ' + message.author.toString() + '.');
      await message.reply({ embeds: [successMessage] });
    } catch (error) {
      console.error('Ban command failed:', error.message);
      await message.reply({ embeds: [responseEmbed(0xED4245, WRONG_EMOJI + ' I could not ban that member. Check my Ban Members permission and role position.')] });
    }
  },
};
