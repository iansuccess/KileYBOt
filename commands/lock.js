const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const LOCK_EMOJI = '<a:lock:1567929674431201281>';
const WRONG_EMOJI = '<:wrong:1567909557957558292>';

module.exports = {
  type: 'message',
  name: 'lock',
  async execute({ message }) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(WRONG_EMOJI + ' You need the Manage Channels permission to use this command.')] });
      return;
    }
    const channel = message.channel;
    const botMember = message.guild.members.me;
    if (channel.isThread?.() || !channel.permissionOverwrites ||
        !botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(WRONG_EMOJI + ' I cannot lock this channel. Check my Manage Channels permission and use this command in a regular text channel.')] });
      return;
    }
    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
        SendMessages: false,
        SendMessagesInThreads: false,
      }, { reason: 'Lock command used by ' + message.author.tag });
    } catch (error) {
      console.error('Could not lock a channel:', error.message);
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(WRONG_EMOJI + ' I could not lock this channel. Check my Manage Channels permission.')] });
      return;
    }
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(LOCK_EMOJI + ' This channel has been locked.')] });
  },
};
