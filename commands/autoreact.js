const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { getAutoReactConfiguration, upsertAutoReactRule } = require('../utils/autoreact');

module.exports = {
  type: 'slash',
  name: 'autoreact',
  data: new SlashCommandBuilder()
    .setName('autoreact')
    .setDescription('Manage this server\'s automatic reaction')
    .addSubcommand((subcommand) => subcommand
      .setName('edit')
      .setDescription('Edit the automatic reaction for this server')
      .addStringOption((option) => option
        .setName('emoji')
        .setDescription('New Unicode or custom emoji')
        .setMaxLength(100)
        .setRequired(true))
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Leave empty to apply the reaction in all channels')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false))),
  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'edit') return;

    const permissions = interaction.memberPermissions;
    const canManage = interaction.user.id === interaction.guild.ownerId ||
      permissions?.has(PermissionFlagsBits.Administrator) ||
      permissions?.has(PermissionFlagsBits.ManageGuild);
    if (!canManage) {
      await interaction.reply({ content: 'Only the server owner, an administrator, or a member with Manage Server can edit auto-react.', ephemeral: true });
      return;
    }

    const currentConfiguration = getAutoReactConfiguration(interaction.guild.id);
    if (!currentConfiguration?.rules.length) {
      await interaction.reply({ content: 'Set up auto-react first with `/setup autoreact`.', ephemeral: true });
      return;
    }

    const emoji = interaction.options.getString('emoji', true).trim();
    const channel = interaction.options.getChannel('channel');
    if (!emoji) {
      await interaction.reply({ content: 'Provide a Unicode or custom emoji for auto-react.', ephemeral: true });
      return;
    }

    upsertAutoReactRule(interaction.guild.id, emoji, channel?.id || null);
    await interaction.reply({
      content: '<:check:1567896022028517416> Auto-react successfully edited for ' + (channel ? channel.toString() : 'all channels') + '. Settings for other channels were kept, and the change is active for new messages.',
      ephemeral: true,
    });
  },
};
