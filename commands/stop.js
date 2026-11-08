const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getAutoReactConfiguration, stopAutoReact } = require('../utils/autoreact');

module.exports = {
  type: 'slash',
  name: 'stop',
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop an enabled LikeyBot feature')
    .addSubcommand((subcommand) => subcommand
      .setName('autoreact')
      .setDescription('Stop automatic reactions in this server')),
  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'autoreact') return;

    const permissions = interaction.memberPermissions;
    const canManage = interaction.user.id === interaction.guild.ownerId ||
      permissions?.has(PermissionFlagsBits.Administrator) ||
      permissions?.has(PermissionFlagsBits.ManageGuild);
    if (!canManage) {
      await interaction.reply({ content: 'Only the server owner, an administrator, or a member with Manage Server can stop auto-react.', ephemeral: true });
      return;
    }

    if (!getAutoReactConfiguration(interaction.guild.id)) {
      await interaction.reply({ content: 'Auto-react is not set up in this server.', ephemeral: true });
      return;
    }

    stopAutoReact(interaction.guild.id);
    await interaction.reply({ content: '<:check:1567896022028517416> Auto-react has been stopped in this server.', ephemeral: true });
  },
};
