const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getBoosterCount, getServerBoostSettings, buildServerBoostPayload } = require('../utils/serverBoosts');

module.exports = {
  type: 'slash',
  name: 'test',
  data: new SlashCommandBuilder()
    .setName('test')
    .setDescription('Preview configured LikeyBot features')
    .addSubcommand((subcommand) => subcommand
      .setName('serverboost')
      .setDescription('Send a demo server boost notification')),
  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'serverboost') return;

    const canManage = interaction.user.id === interaction.guild.ownerId ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
    if (!canManage) {
      await interaction.reply({ content: 'Only the server owner, an administrator, or a member with Manage Server can test server boost notifications.', ephemeral: true });
      return;
    }

    const settings = getServerBoostSettings(interaction.guild.id);
    if (!settings?.channelId) {
      await interaction.reply({ content: 'Set up server boost notifications first with `/setup serverboost`.', ephemeral: true });
      return;
    }

    const channel = interaction.guild.channels.cache.get(settings.channelId) ||
      await interaction.guild.channels.fetch(settings.channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: 'The configured server boost channel is unavailable. Run `/setup serverboost` again.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      const demoMember = await interaction.guild.members.fetch(interaction.user.id);
      const demoBoostCount = getBoosterCount(interaction.guild.id, interaction.user.id) + 1;
      const payload = await buildServerBoostPayload(interaction.guild, demoMember, demoBoostCount);
      await channel.send(payload);
      await interaction.editReply('Demo server boost notification sent to ' + channel.toString() + '. This test did not change any boost counts.');
    } catch (error) {
      console.error('Server boost preview failed:', error.message);
      await interaction.editReply('I could not send the demo notification. Check my permissions in the configured channel.');
    }
  },
};
