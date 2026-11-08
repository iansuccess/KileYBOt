const { SlashCommandBuilder } = require('discord.js');
const {
  setWhitelistAction,
  setAllWhitelistActions,
} = require('../utils/moderation');

const TOGGLE_CHOICES = [
  { name: 'Enable', value: 'enable' },
  { name: 'Disable', value: 'disable' },
];

function addToggle(builder, name, description, includeRole = true) {
  return builder.addSubcommand((subcommand) => {
    subcommand
    .setName(name)
    .setDescription(description)
    .addStringOption((option) => option
      .setName('status')
      .setDescription('Enable or disable whitelist exemptions for this action')
      .setRequired(true)
      .addChoices(...TOGGLE_CHOICES));
    if (includeRole) {
      subcommand.addRoleOption((option) => option
        .setName('role')
        .setDescription('Members with this role are exempt when the setting is enabled')
        .setRequired(false));
    }
    return subcommand;
  });
}

let data = new SlashCommandBuilder()
  .setName('whitelist')
  .setDescription('Configure role-based whitelist exemptions for this server');

data = addToggle(data, 'anti-link', 'Control whitelist exemptions for Anti Link');
data = addToggle(data, 'creating-role', 'Control whitelist exemptions when creating roles');
data = addToggle(data, 'creating-channel', 'Control whitelist exemptions when creating channels');
data = addToggle(data, 'deleting-role', 'Control whitelist exemptions when deleting roles');
data = addToggle(data, 'deleting-channel', 'Control whitelist exemptions when deleting channels');
data = addToggle(data, 'giving-admin-role', 'Control whitelist exemptions when assigning Administrator roles');
data = addToggle(data, 'making-role-with-admin', 'Control whitelist exemptions when creating or enabling Administrator roles');
data = addToggle(data, 'kick', 'Control whitelist exemptions for the kick command');
data = addToggle(data, 'ban', 'Control whitelist exemptions for the ban command');
data = addToggle(data, 'purge', 'Control whitelist access for the purge command');
data = addToggle(data, 'adding-bot', 'Control whitelist exemptions when adding bots to this server');
data = addToggle(data, 'all', 'Enable or disable all whitelist action exemptions');

module.exports = {
  type: 'slash',
  name: 'whitelist',
  data,
  async execute(interaction) {
    if (interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: 'Only the server owner can manage this whitelist.', ephemeral: true });
      return;
    }

    const action = interaction.options.getSubcommand();
    const enabled = interaction.options.getString('status', true) === 'enable';
    const role = interaction.options.getRole('role');
    if (enabled && !role) {
      await interaction.reply({ content: 'Choose a role when enabling whitelist exemptions. You can leave the role empty when disabling them.', ephemeral: true });
      return;
    }

    let savedSettings;
    if (action === 'all') savedSettings = setAllWhitelistActions(interaction.guild.id, enabled, role?.id || null);
    else savedSettings = setWhitelistAction(interaction.guild.id, actionMap[action], enabled, role?.id);

    const savedAction = savedSettings.whitelistActions?.[actionMap[action]];
    const savedRoleIds = savedAction
      ? [...new Set([
        ...(Array.isArray(savedAction.roleIds) ? savedAction.roleIds : []),
        ...(savedAction.roleId ? [savedAction.roleId] : []),
      ])]
      : [];
    const displayedRoles = savedRoleIds.slice(0, 15).map((id) => '<@&' + id + '>');
    if (savedRoleIds.length > displayedRoles.length) displayedRoles.push('and ' + (savedRoleIds.length - displayedRoles.length) + ' more');
    await interaction.reply({
      content: action === 'all'
        ? 'All whitelist action exemptions are now ' + (enabled ? 'enabled. The selected role was added while existing whitelisted roles were kept.' : 'disabled') + ' in this server.'
        : enabled
          ? 'Whitelist exemptions for **' + labelForAction(action) + '** are enabled. Current whitelisted roles: ' + (displayedRoles.join(', ') || 'None') + '.'
          : 'Whitelist exemptions for **' + labelForAction(action) + '** are now disabled in this server.',
      ephemeral: true,
    });
  },
};

const actionMap = {
  'anti-link': 'antiLink',
  'creating-role': 'creatingRole',
  'creating-channel': 'creatingChannel',
  'deleting-role': 'deletingRole',
  'deleting-channel': 'deletingChannel',
  'giving-admin-role': 'givingAdminRole',
  'making-role-with-admin': 'makingRoleWithAdmin',
  kick: 'kick',
  ban: 'ban',
  purge: 'purge',
  'adding-bot': 'addingBot',
};

function labelForAction(action) {
  return {
    'anti-link': 'Anti Link',
    'creating-role': 'Creating Role',
    'creating-channel': 'Creating Channel',
    'deleting-role': 'Deleting Role',
    'deleting-channel': 'Deleting Channel',
    'giving-admin-role': 'Giving Admin Role',
    'making-role-with-admin': 'Making Role with Admin',
    kick: 'Kick',
    ban: 'Ban',
    purge: 'Purge',
    'adding-bot': 'Adding Bot',
  }[action] || action;
}
