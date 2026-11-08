const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const WRONG_EMOJI = '<:wrong:1567909557957558292>';
const CHECK_EMOJI = '<:check:1567896022028517416>';

function embed(color, description) {
  return new EmbedBuilder().setColor(color).setDescription(description);
}

module.exports = {
  type: 'message',
  name: 'untimeout',
  async execute({ message, argsText, currentPrefix }) {
    const targetMatch = argsText.trim().match(/^<@!?(\d{17,20})>$|^(\d{17,20})$/);
    if (!targetMatch) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' Use `' + currentPrefix + 'untimeout @user`.')] });
      return;
    }
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' You need the Moderate Members permission to use this command.')] });
      return;
    }

    const target = await message.guild.members.fetch(targetMatch[1] || targetMatch[2]).catch(() => null);
    if (!target) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' I could not find that member in this server.')] });
      return;
    }
    if (!target.communicationDisabledUntilTimestamp || target.communicationDisabledUntilTimestamp <= Date.now()) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' This member is not currently timed out.')] });
      return;
    }
    if (target.id === message.author.id || (message.author.id !== message.guild.ownerId &&
        message.member.roles.highest.comparePositionTo(target.roles.highest) <= 0)) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' You cannot remove a timeout from yourself or a member with an equal or higher role.')] });
      return;
    }

    const botMember = message.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ModerateMembers) || !target.manageable) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' I cannot remove this timeout. Check my Moderate Members permission and role position.')] });
      return;
    }

    try {
      await target.timeout(null, 'Untimeout command used by ' + message.author.tag);
    } catch (error) {
      console.error('Could not remove a member timeout:', error.message);
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' I could not remove this timeout. Check my Moderate Members permission and role position.')] });
      return;
    }

    await message.reply({ embeds: [embed(0xFFFFFF, CHECK_EMOJI + ' ' + target.toString() + ' was untimeouted successfully.')] });
  },
};
