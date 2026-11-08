const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const WRONG_EMOJI = '<:wrong:1567909557957558292>';
const MAX_SLOWMODE_SECONDS = 21600;

module.exports = {
  type: 'message',
  name: 'slowmode',
  async execute({ message, argsText, currentPrefix }) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(WRONG_EMOJI + ' You need the Manage Channels permission to use this command.')] });
      return;
    }
    const input = argsText.trim().toLowerCase();
    const match = input.match(/^(\d+)(s)?$/);
    const seconds = match ? Number(match[1]) : NaN;
    if (!match || !Number.isSafeInteger(seconds) || seconds < 0 || seconds > MAX_SLOWMODE_SECONDS) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(WRONG_EMOJI + ' Use `' + currentPrefix + 'slowmode <seconds>` or append `s`, for example `2` or `2s`. Enter `0` to turn it off; the maximum is `21600` seconds (6 hours).')] });
      return;
    }
    const botMember = message.guild.members.me;
    if (!message.channel.setRateLimitPerUser || !botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(WRONG_EMOJI + ' I cannot change slowmode here. Check my Manage Channels permission.')] });
      return;
    }
    try {
      await message.channel.setRateLimitPerUser(seconds, 'Slowmode command used by ' + message.author.tag);
    } catch (error) {
      console.error('Could not set channel slowmode:', error.message);
      await message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setDescription(WRONG_EMOJI + ' I could not change slowmode. Check my Manage Channels permission.')] });
      return;
    }
    const state = seconds === 0 ? 'Slowmode is now off.' : 'Slowmode is now ' + seconds + ' seconds.';
    await message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setDescription(state)] });
  },
};
