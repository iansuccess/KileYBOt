const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { setCatcherChannel } = require('../utils/unauthorizedCatcher');

module.exports = {
  type: 'slash',
  name: 'unauthorize',
  data: new SlashCommandBuilder()
    .setName('unauthorize')
    .setDescription('Configure unauthorized activity notifications for this server')
    .addSubcommand((subcommand) => subcommand
      .setName('catcher')
      .setDescription('Choose where unauthorized activity notifications are sent')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Text channel for unauthorized activity notifications')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true))),
  async execute(interaction) {
    if (interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: 'Only the server owner can configure the unauthorized catcher.', ephemeral: true });
      return;
    }

    const channel = interaction.options.getChannel('channel', true);
    if (channel.guildId !== interaction.guild.id) {
      await interaction.reply({ content: 'Choose a text channel from this server.', ephemeral: true });
      return;
    }
    const botMember = interaction.guild.members.me;
    const permissions = botMember && channel.permissionsFor(botMember);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      await interaction.reply({ content: 'I need View Channel and Send Messages permissions in that channel.', ephemeral: true });
      return;
    }

    setCatcherChannel(interaction.guild.id, channel.id);
    await interaction.reply({
      content: 'Unauthorized activity notifications for this server will be sent to ' + channel.toString() + '.',
      ephemeral: true,
    });
  },
};
