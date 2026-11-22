const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { createBackup } = require('../utils/backup');

module.exports = {
  type: 'slash',
  name: 'backup',
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Create a backup of this server and LikeyBot settings'),
  async execute(interaction) {
    if (interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: 'Only the server owner can create a backup.', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      await Promise.all([interaction.guild.roles.fetch(), interaction.guild.channels.fetch()]);
      const result = await createBackup(interaction.guild);
      const embed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle('Server Backup Created')
        .setDescription('This backup is linked to **' + interaction.guild.name.replace(/[*_`~|]/g, '') + '** and can only be restored in this same server. Keep the JSON file somewhere safe.')
        .addFields(
          { name: 'Roles', value: String(result.backup.roles.length), inline: true },
          { name: 'Channels', value: String(result.backup.channels.length), inline: true },
          { name: 'Created', value: '<t:' + Math.floor(Date.now() / 1000) + ':F>', inline: true },
        );
      const payload = { embeds: [embed] };
      if (result.size <= 24 * 1024 * 1024) {
        payload.files = [new AttachmentBuilder(result.file, { name: 'likeybot-server-backup.json' })];
      } else {
        embed.addFields({ name: 'Backup file', value: 'The snapshot is larger than Discord\'s upload limit. It is saved in `data/backups/' + interaction.guild.id + '.json`.' });
      }
      await interaction.editReply(payload);
    } catch (error) {
      console.error('Could not create server backup:', error);
      await interaction.editReply({ content: 'I could not create the backup. Check my View Channels and Attach Files access, then try again.' });
    }
  },
};
