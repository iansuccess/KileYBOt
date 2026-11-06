const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const {
  buildPanelPayload,
  createTicketPanel,
  deleteTicketPanel,
  getTicketPanel,
  getTicketPanels,
  resetPanelImage,
  saveCustomPanelImage,
  updateTicketPanel,
} = require('../utils/tickets');

const CREATE_PANEL_VALUE = '__create_another_panel__';

module.exports = {
  type: 'slash',
  name: 'edit',
  data: new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Edit server setup panels')
    .addSubcommand((subcommand) => subcommand
      .setName('panel')
      .setDescription('Choose and customize a named ticket panel')
      .addStringOption((option) => option
        .setName('panel')
        .setDescription('Choose a panel to edit or make another panel')
        .setAutocomplete(true)
        .setRequired(true))
      .addStringOption((option) => option
        .setName('panel_name')
        .setDescription('Name for the new panel when choosing Make Another Panel')
        .setMaxLength(80)
        .setRequired(false))
      .addStringOption((option) => option
        .setName('title')
        .setDescription('Panel title')
        .setMaxLength(100)
        .setRequired(false))
      .addStringOption((option) => option
        .setName('text')
        .setDescription('Panel text; custom emojis are supported')
        .setMaxLength(4000)
        .setRequired(false))
      .addAttachmentOption((option) => option
        .setName('image')
        .setDescription('Upload a PNG, JPG, GIF, or WEBP panel image')
        .setRequired(false))
      .addBooleanOption((option) => option
        .setName('reset_image')
        .setDescription('Restore the default panel image')
        .setRequired(false))),
  async autocomplete(interaction) {
    if (!interaction.guild || interaction.user.id !== interaction.guild.ownerId) {
      try {
        await interaction.respond([]);
      } catch (error) {
        if (error.code !== 10062) throw error;
      }
      return;
    }
    const search = interaction.options.getFocused().toLowerCase();
    const choices = [{ name: 'Make Another Panel', value: CREATE_PANEL_VALUE }]
      .concat(getTicketPanels(interaction.guild.id)
      .filter((panel) => panel.name.toLowerCase().includes(search))
      .slice(0, 25)
      .map((panel) => ({ name: panel.name.slice(0, 100), value: panel.id })));
    try {
      await interaction.respond(choices.slice(0, 25));
    } catch (error) {
      if (error.code !== 10062) throw error;
    }
  },
  async execute(interaction) {
    if (interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: 'Only the server owner can edit ticket panels.', ephemeral: true });
      return;
    }

    const panelId = interaction.options.getString('panel', true);
    if (panelId === CREATE_PANEL_VALUE) {
      const panelName = interaction.options.getString('panel_name')?.trim();
      const title = interaction.options.getString('title');
      const text = interaction.options.getString('text');
      const image = interaction.options.getAttachment('image');
      const resetImage = interaction.options.getBoolean('reset_image') || false;
      const channel = interaction.channel;
      if (!panelName) {
        await interaction.reply({ content: 'Enter the new panel name in the panel_name option.', ephemeral: true });
        return;
      }
      if ([title, text].some((value) => value !== null && !value.trim())) {
        await interaction.reply({ content: 'Panel title and text cannot be empty.', ephemeral: true });
        return;
      }
      if (image && resetImage) {
        await interaction.reply({ content: 'Choose either a new image or reset the image, not both.', ephemeral: true });
        return;
      }
      if (!channel?.isTextBased() || !channel.send || !interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({ content: 'I cannot create a ticket panel here. Check my Manage Channels, View Channel, Send Messages, Embed Links, and Attach Files permissions.', ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      let newPanel;
      try {
        newPanel = createTicketPanel(interaction.guild.id, panelName, channel.id);
        const updates = {};
        if (title !== null) updates.title = title;
        if (text !== null) updates.description = text;
        if (Object.keys(updates).length > 0) updateTicketPanel(interaction.guild.id, newPanel.id, updates);
        if (resetImage) resetPanelImage(interaction.guild.id, newPanel.id);
        if (image) await saveCustomPanelImage(interaction.guild.id, newPanel.id, image);
        await channel.send(buildPanelPayload(interaction.guild.id, newPanel.id));
        await interaction.editReply({ content: 'Ticket panel **' + newPanel.name + '** was created and posted in this channel. You can select it in /edit panel.' });
      } catch (error) {
        if (newPanel) deleteTicketPanel(interaction.guild.id, newPanel.id);
        console.error('Could not create another ticket panel:', error.message);
        const errorMessage = String(error.message || error);
        const failureMessage = /panel|image|attachment/i.test(errorMessage)
          ? errorMessage
          : 'I could not post the ticket panel. Check my permissions in this channel.';
        await interaction.editReply({ content: failureMessage });
      }
      return;
    }

    const currentPanel = getTicketPanel(interaction.guild.id, panelId);
    if (!currentPanel) {
      await interaction.reply({ content: 'Choose a panel created in this server with /setup ticket.', ephemeral: true });
      return;
    }

    const title = interaction.options.getString('title');
    const text = interaction.options.getString('text');
    const image = interaction.options.getAttachment('image');
    const resetImage = interaction.options.getBoolean('reset_image') || false;
    if (image && resetImage) {
      await interaction.reply({ content: 'Choose either a new image or reset the image, not both.', ephemeral: true });
      return;
    }
    if ([title, text].some((value) => value !== null && !value.trim())) {
      await interaction.reply({ content: 'Panel title and text cannot be empty.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const updates = {};
    if (title !== null) updates.title = title;
    if (text !== null) updates.description = text;
    if (Object.keys(updates).length > 0) updateTicketPanel(interaction.guild.id, panelId, updates);
    if (resetImage) resetPanelImage(interaction.guild.id, panelId);
    if (image) {
      try {
        await saveCustomPanelImage(interaction.guild.id, panelId, image);
      } catch (error) {
        await interaction.editReply({ content: 'I could not use that image. ' + error.message });
        return;
      }
    }

    const payload = buildPanelPayload(interaction.guild.id, panelId, { includeBringButton: true });
    await interaction.editReply({ ...payload });
  },
};
