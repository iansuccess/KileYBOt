const { PermissionFlagsBits } = require('discord.js');

const CHECK_EMOJI = '<:check:1567896022028517416>';
const WRONG_EMOJI = '<:wrong:1567909557957558292>';

function canCreateRole(message) {
  return message.author.id === message.guild.ownerId ||
    message.member.permissions.has(PermissionFlagsBits.Administrator) ||
    message.member.permissions.has(PermissionFlagsBits.ManageRoles);
}

function escapeMarkdown(value) {
  return value.replace(/[\\*_~`|>]/g, '\\$&');
}

module.exports = {
  type: 'message',
  name: 'addrole',
  async execute({ message, argsText, currentPrefix }) {
    if (!canCreateRole(message)) return;

    const name = argsText.trim();
    if (!name) {
      await message.reply({
        content: WRONG_EMOJI + ' Use `' + currentPrefix + 'addrole role name`. You can include spaces and symbols.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (name.length > 100) {
      await message.reply({
        content: WRONG_EMOJI + ' Role names must be 100 characters or fewer.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (!message.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      await message.reply({
        content: WRONG_EMOJI + ' I need the Manage Roles permission to create a role.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    try {
      const role = await message.guild.roles.create({
        name,
        color: 0,
        hoist: false,
        mentionable: false,
        permissions: [],
        reason: 'Role created by ' + message.author.tag,
      });
      await message.reply({
        content: CHECK_EMOJI + ' Role created by - <@' + message.author.id + '>: **' + escapeMarkdown(role.name) + '**',
        allowedMentions: { users: [message.author.id] },
      });
    } catch (error) {
      console.error('Could not create a role:', error.message);
      await message.reply({
        content: WRONG_EMOJI + ' I could not create that role. Check my Manage Roles permission and role position.',
        allowedMentions: { repliedUser: false },
      });
    }
  },
};
