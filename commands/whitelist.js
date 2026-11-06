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
        .setRequired(true));
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
    const role = interaction.options.getRole('role', true);
    if (action === 'all') setAllWhitelistActions(interaction.guild.id, enabled, role.id);
    else setWhitelistAction(interaction.guild.id, actionMap[action], enabled, role.id);
    await interaction.reply({
      content: action === 'all'
        ? 'All whitelist action exemptions for ' + role.toString() + ' are now ' + (enabled ? 'enabled' : 'disabled') + ' in this server.'
        : 'Whitelist exemptions for **' + labelForAction(action) + '** using ' + role.toString() + ' are now ' + (enabled ? 'enabled' : 'disabled') + ' in this server.',
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
  }[action] || action;
}
