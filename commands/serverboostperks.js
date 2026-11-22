const path = require('node:path');
const {
  AttachmentBuilder,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
} = require('discord.js');

const IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);
const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

module.exports = {
  type: 'slash',
  name: 'serverboostperks',
  data: new SlashCommandBuilder()
    .setName('serverboostperks')
    .setDescription('Post this server’s server boost perks')
    .addStringOption((option) => option
      .setName('text')
      .setDescription('Perks message; animated custom emoji are allowed')
      .setMaxLength(4000)
      .setRequired(true))
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Channel where the perks message will be posted')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true))
    .addAttachmentOption((option) => option
      .setName('image')
      .setDescription('Optional JPG, PNG, WebP, or GIF image')
      .setRequired(false)),
  async execute(interaction) {
    if (interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: 'Only the server owner can use this command.', ephemeral: true });
      return;
    }

    const text = interaction.options.getString('text', true);
    const channel = interaction.options.getChannel('channel', true);
    const image = interaction.options.getAttachment('image');
    if (channel.guildId !== interaction.guild.id) {
      await interaction.reply({ content: 'Choose a text channel from this server.', ephemeral: true });
      return;
    }

    let fileName = null;
    if (image) {
      const mimeType = (image.contentType || '').split(';')[0].toLowerCase();
      const sourceExtension = path.extname(image.name || '').toLowerCase();
      const extension = IMAGE_EXTENSIONS.get(mimeType) ||
        (SUPPORTED_EXTENSIONS.has(sourceExtension) ? (sourceExtension === '.jpeg' ? '.jpg' : sourceExtension) : null);
      if (!extension) {
        await interaction.reply({ content: 'Choose a JPG, PNG, WebP, or GIF image.', ephemeral: true });
        return;
      }
      fileName = 'server-boost-perks' + extension;
    }

    const botMember = interaction.guild.members.me;
    const channelPermissions = botMember && channel.permissionsFor(botMember);
    const requiredPermissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
    if (image) requiredPermissions.push(PermissionFlagsBits.AttachFiles);
    if (!channelPermissions?.has(requiredPermissions)) {
      await interaction.reply({ content: 'I need View Channel and Send Messages permissions in that channel' + (image ? ', plus Attach Files.' : '.'), ephemeral: true });
      return;
    }

    // A visible progress reply avoids leaving users on Discord's thinking spinner
    // while Discord fetches and uploads the selected image.
    await interaction.reply({ content: 'Posting server boost perks…', ephemeral: true });
    const container = new ContainerBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
    const files = [];
    if (image && fileName) {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL('attachment://' + fileName),
        ),
      );
      files.push(new AttachmentBuilder(image.url, { name: fileName }));
    }

    try {
      await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
        ...(files.length ? { files } : {}),
      });
      await interaction.editReply('Server boost perks posted in ' + channel.toString() + '.');
    } catch (error) {
      console.error('Could not post server boost perks in server ' + interaction.guild.id + ':', error.message);
      await interaction.editReply('I could not post the server boost perks. Check my channel permissions and image size.');
    }
  },
};
