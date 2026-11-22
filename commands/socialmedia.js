const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getPrefix } = require('../utils/prefixes');
const {
  PLATFORM_LABELS,
  getSocialMediaEntries,
  editSocialMediaEntry,
} = require('../utils/socialMedia');

module.exports = {
  type: 'slash',
  name: 'socialmedia',
  data: new SlashCommandBuilder()
    .setName('socialmedia')
    .setDescription('Edit this server\'s social media links')
    .addSubcommand((subcommand) => subcommand
      .setName('edit')
      .setDescription('Edit a saved social media entry')
      .addStringOption((option) => option
        .setName('panel_name')
        .setDescription('Choose the configured panel name to edit')
        .setRequired(true)
        .setAutocomplete(true))
      .addStringOption((option) => option
        .setName('link')
        .setDescription('New profile URL')
        .setMaxLength(500)
        .setRequired(false))
      .addStringOption((option) => option
        .setName('new_panel_name')
        .setDescription('New separate panel name')
        .setMaxLength(80)
        .setRequired(false))
      .addStringOption((option) => option
        .setName('choice')
        .setDescription('Change the social media platform')
        .setRequired(false)
        .addChoices(
          { name: 'Instagram', value: 'instagram' },
          { name: 'Facebook', value: 'facebook' },
          { name: 'YouTube', value: 'youtube' },
          { name: 'TikTok', value: 'tiktok' },
        ))),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = getSocialMediaEntries(interaction.guild.id)
      .filter((entry) => entry.panelName.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((entry) => ({
        name: PLATFORM_LABELS[entry.platform] + ' — ' + entry.panelName,
        value: entry.panelName,
      }));
    await interaction.respond(choices);
  },
  async execute(interaction) {
    const isOwnerOrAdmin = interaction.user.id === interaction.guild.ownerId ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (!isOwnerOrAdmin) {
      await interaction.reply({ content: 'Only the server owner or an administrator can edit social media links.', ephemeral: true });
      return;
    }

    const currentPanelName = interaction.options.getString('panel_name', true);
    const link = interaction.options.getString('link');
    const newPanelName = interaction.options.getString('new_panel_name');
    const platform = interaction.options.getString('choice');
    if (!link && !newPanelName && !platform) {
      await interaction.reply({ content: 'Change at least one of the link, new_panel_name, or choice options.', ephemeral: true });
      return;
    }

    try {
      const entry = editSocialMediaEntry(interaction.guild.id, currentPanelName, {
        link,
        panelName: newPanelName,
        platform,
      });
      await interaction.reply({
        content: PLATFORM_LABELS[entry.platform] + ' panel **' + entry.panelName + '** was updated. Use `' + getPrefix(interaction.guild.id) + { instagram: 'ig', facebook: 'fb', youtube: 'yt', tiktok: 'tt' }[entry.platform] + ' ' + entry.panelName + '`.',
        ephemeral: true,
      });
    } catch (error) {
      await interaction.reply({ content: 'I could not edit that social media entry. ' + error.message, ephemeral: true });
    }
  },
};
