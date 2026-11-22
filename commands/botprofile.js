const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  type: 'slash',
  name: 'botprofile',
  data: new SlashCommandBuilder()
    .setName('botprofile')
    .setDescription('Manage this server’s bot profile avatar')
    .addSubcommand((subcommand) => subcommand
      .setName('default')
      .setDescription('Restore the bot’s default profile avatar')),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand !== 'default') return;

    const canManageProfile = interaction.user.id === interaction.guild.ownerId ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if (!canManageProfile) {
      await interaction.reply({ content: 'Only the server owner or an administrator can reset the bot profile for this server.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      await interaction.guild.members.editMe({
        avatar: null,
        reason: 'Server owner restored the default guild-specific bot profile.',
      });
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setDescription('The bot profile has been restored to its default for this server. Other servers are unchanged.');
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Could not reset this server’s bot profile:', error);
      await interaction.editReply({ content: 'I could not reset the bot profile. Please try again later.' });
    }
  },
};
