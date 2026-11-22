const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const ADMIN_EMOJI = '<a:verify:1568659423386148988>';
const NOT_ADMIN_EMOJI = '<a:wrong1:1568659707286257724>';

module.exports = {
  type: 'message',
  name: 'whois',
  async execute({ message, argsText, currentPrefix }) {
    let targetMember = message.mentions.members?.first() || null;
    const input = argsText.trim();

    if (input && !targetMember) {
      const idMatch = input.match(/^(?:<@!?(\d{17,20})>|(\d{17,20}))$/);
      if (idMatch) {
        targetMember = await message.guild.members.fetch(idMatch[1] || idMatch[2]).catch(() => null);
      }
      if (!targetMember) {
        await message.reply('Use `' + currentPrefix + 'whois` or `' + currentPrefix + 'whois @user`.');
        return;
      }
    }

    targetMember ||= message.member;
    const targetUser = targetMember.user;
    const sortedRoles = targetMember.roles.cache
      .filter((role) => role.id !== message.guild.id)
      .sort((first, second) => second.position - first.position);

    let roleText = '';
    for (const role of sortedRoles.values()) {
      const nextRole = role.toString();
      const separator = roleText ? ', ' : '';
      if ((roleText + separator + nextRole).length > 1024) {
        roleText += (roleText ? ', ' : '') + '…';
        break;
      }
      roleText += separator + nextRole;
    }

    const isAdmin = targetMember.permissions.has(PermissionFlagsBits.Administrator);
    const embed = new EmbedBuilder()
      .setTitle('<a:notify:1568657138694225930> **User Info**')
      .setThumbnail(targetUser.displayAvatarURL({ size: 512 }))
      .addFields(
        {
          name: 'User',
          value: targetMember.toString() + '\n' + targetUser.username,
          inline: true,
        },
        {
          name: 'Role',
          value: '**' + sortedRoles.size + '** role' + (sortedRoles.size === 1 ? '' : 's') +
            '\n' + (roleText || 'None'),
          inline: false,
        },
        {
          name: 'Admin',
          value: isAdmin ? ADMIN_EMOJI : NOT_ADMIN_EMOJI,
          inline: true,
        },
      );

    await message.channel.send({ embeds: [embed] });
  },
};
