const { EmbedBuilder } = require('discord.js');
const {
  isStatsEnabled,
  buildLeaderboardPayload,
  takeCommandCooldown,
} = require('../utils/stats');

function whiteNotice(text) {
  return new EmbedBuilder().setColor(0xFFFFFF).setDescription(text);
}

module.exports = {
  type: 'message',
  name: 'lb',
  aliases: ['leaderboard'],
  async execute({ message, currentPrefix }) {
    if (!isStatsEnabled(message.guild.id)) {
      await message.reply({ embeds: [whiteNotice('A server owner must run `/setup stats` before the activity leaderboard is available.')] });
      return;
    }

    const cooldownSeconds = takeCommandCooldown(message.guild.id, message.author.id);
    if (cooldownSeconds > 0) {
      await message.reply({ embeds: [whiteNotice('Please wait ' + cooldownSeconds + ' second' + (cooldownSeconds === 1 ? '' : 's') + ' before using `' + currentPrefix + 'lb` or `' + currentPrefix + 'stats` again.')] });
      return;
    }

    await message.reply(buildLeaderboardPayload(message.guild.id, message.author.id));
  },
};
