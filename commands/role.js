const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isWhitelisted } = require('../utils/moderation');

function resultEmbed(color, text) {
  return new EmbedBuilder().setColor(color).setDescription(text);
}

module.exports = {
  type: 'message',
  name: 'role',
  async execute({ client, message, argsText, currentPrefix }) {
    const isGuildOwner = message.author.id === message.guild.ownerId;
    const isAdministrator = message.member.permissions.has(PermissionFlagsBits.Administrator);
    const canManageRoles = message.member.permissions.has(PermissionFlagsBits.ManageRoles);
    if (!isGuildOwner && !isAdministrator && !canManageRoles) return;

    const userMatch = argsText.match(/<@!?(\d{17,20})>|\b(\d{17,20})\b/);
    const roleMatch = argsText.match(/<@&(\d{17,20})>/);
    if (!userMatch || !roleMatch) {
      await message.reply({ embeds: [resultEmbed(0xED4245, '<:wrong:1567909557957558292> Check your permission first. Use `' + currentPrefix + 'role @user @role`.')] });
      return;
    }

    const targetId = userMatch[1] || userMatch[2];
    const roleId = roleMatch[1];
    const [target, role] = await Promise.all([
      message.guild.members.fetch(targetId).catch(() => null),
      message.guild.roles.fetch(roleId).catch(() => null),
    ]);
    if (!target || !role) {
      await message.reply({ embeds: [resultEmbed(0xED4245, '<:wrong:1567909557957558292> Check your permission first. I could not find that member or role; mention both and try again.')] });
      return;
    }
    if (role.id === message.guild.id) {
      await message.reply({ embeds: [resultEmbed(0xED4245, '<:wrong:1567909557957558292> The @everyone role cannot be assigned or removed with this command.')] });
      return;
    }
    if (role.managed) {
      await message.reply({ embeds: [resultEmbed(0xED4245, '<:wrong:1567909557957558292> This role is managed by a Discord integration and cannot be assigned or removed by LikeyBot.')] });
      return;
    }

    const botMember = message.guild.members.me;
    const botCanManageTarget = target.id === client.user.id || target.id === message.guild.ownerId || target.manageable;
    const actorCanManageRole = isGuildOwner || message.member.roles.highest.comparePositionTo(role) > 0;
    const actorCanManageTarget = isGuildOwner || target.id === message.author.id ||
      message.member.roles.highest.comparePositionTo(target.roles.highest) > 0;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable || !botCanManageTarget ||
        !actorCanManageRole || !actorCanManageTarget) {
      const reason = !botMember?.permissions.has(PermissionFlagsBits.ManageRoles)
        ? 'I need the Manage Roles permission.'
        : !actorCanManageRole || !actorCanManageTarget
          ? "Move my highest role above the target member's highest role."
          : !role.editable
            ? 'Move my highest role above the role you want to assign.'
            : !botCanManageTarget
              ? "Move my highest role above the target member's highest role."
              : 'The role hierarchy prevents this change.';
      await message.reply({ embeds: [resultEmbed(0xED4245, '<:wrong:1567909557957558292> Check your permission first. ' + reason)] });
      return;
    }

    const removing = target.roles.cache.has(role.id);
    try {
      if (removing) {
        await target.roles.remove(role, 'Role command used by ' + message.author.tag);
      } else {
        await target.roles.add(role, 'Role command used by ' + message.author.tag);
      }
    } catch (error) {
      console.error('Role command could not update a role:', error.message);
      await message.reply({ embeds: [resultEmbed(0xED4245, '<:wrong:1567909557957558292> Check your permission first. Discord rejected the role change: ' + error.message + (error.code ? ' (code ' + error.code + ')' : ''))] });
      return;
    }

    const isAdministratorRole = role.permissions.has(PermissionFlagsBits.Administrator);
    const actorWhitelisted = isGuildOwner || isWhitelisted(message.guild.id, message.author.id, message.guild.ownerId);
    if (isAdministratorRole && !actorWhitelisted) {
      let recipientNote = '';
      if (!removing && target.id !== message.guild.ownerId && target.id !== client.user.id) {
        try {
          await target.roles.remove(role, 'Anti Nuke: Administrator role assigned by a non-whitelisted user');
          recipientNote = ' The Administrator role was removed from ' + target.user.tag + '.';
        } catch (error) {
          recipientNote = ' I could not remove the Administrator role from ' + target.user.tag + ': ' + error.message;
        }
      }
      try {
        await message.member.roles.set([], 'Anti Nuke: unwhitelisted user changed an Administrator role');
      } catch (error) {
        recipientNote += " I could not clear the actor's roles: " + error.message;
      }
      const notice = 'Anti Nuke Protection punished ' + message.author.tag + ' (' + message.author.id + ') for ' +
        (removing ? 'removing Administrator role ' : 'assigning Administrator role ') + role.name +
        ' ' + (removing ? 'from ' : 'to ') + target.user.tag + ' (' + target.id + '). Their manageable roles were removed.' + recipientNote;
      try {
        const owner = await message.guild.fetchOwner();
        await owner.send(notice);
      } catch (error) {
        console.error('Could not DM the server owner about the role command:', error.message);
        if (message.guild.systemChannel) await message.guild.systemChannel.send(notice).catch(() => {});
      }
      await message.reply({ embeds: [resultEmbed(0xED4245, '<:wrong:1567909557957558292> Anti Nuke Protection punished you for changing an Administrator role because you are not whitelisted.')] });
      return;
    }

    const description = removing
      ? '<:check:1567896022028517416> Role removed from ' + target.user.toString() + ' — removed by ' + message.author.toString()
      : '<:check:1567896022028517416> Role assigned to ' + target.user.toString() + ' — assigned by ' + message.author.toString();
    await message.reply({ embeds: [resultEmbed(0x57F287, description)] });
  },
};
