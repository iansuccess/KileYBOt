const { EmbedBuilder } = require('discord.js');
const {
  isStatsEnabled,
  getUserStats,
  formatVoiceTime,
  takeCommandCooldown,
} = require('../utils/stats');

function whiteNotice(text) {
  return new EmbedBuilder().setColor(0xFFFFFF).setDescription(text);
}

module.exports = {
  type: 'message',
  name: 'stats',
  async execute({ message, currentPrefix }) {
    if (!isStatsEnabled(message.guild.id)) {
      await message.reply({ embeds: [whiteNotice('A server owner must run `/setup stats` before activity stats are available.')] });
      return;
    }

    const cooldownSeconds = takeCommandCooldown(message.guild.id, message.author.id);
    if (cooldownSeconds > 0) {
      await message.reply({ embeds: [whiteNotice('Please wait ' + cooldownSeconds + ' second' + (cooldownSeconds === 1 ? '' : 's') + ' before using `' + currentPrefix + 'lb` or `' + currentPrefix + 'stats` again.')] });
      return;
    }

    const memberStats = getUserStats(message.guild.id, message.author.id);
    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('Activity Stats')
      .setDescription('Activity totals for ' + message.author.toString() + ' in this server.')
      .addFields(
        { name: 'Chat Messages', value: memberStats.messages.toLocaleString(), inline: true },
        { name: 'Voice Time', value: formatVoiceTime(memberStats.voiceSeconds), inline: true },
      );
    await message.reply({ embeds: [embed] });
  },
};
