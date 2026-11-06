const { EmbedBuilder } = require('discord.js');
const { unjailMember, hasJailCommandAccess } = require('../utils/jail');

function response(color, text) {
  return new EmbedBuilder().setColor(color).setDescription(text);
}

module.exports = {
  type: 'message',
  name: 'unjail',
  async execute({ message, currentPrefix }) {
    if (!hasJailCommandAccess(message)) return;
    const target = message.mentions.members.first();
    if (!target) {
      await message.reply({ embeds: [response(0xED4245, '<:wrong:1567909557957558292> Use `' + currentPrefix + 'unjail @target`. Mention the jailed member.')], allowedMentions: { repliedUser: false } });
      return;
    }
    try {
      const result = await unjailMember(message, target);
      const detail = result.failures.length
        ? ' Some saved roles or channel permissions could not be restored. Fix the bot permissions and retry `' + currentPrefix + 'unjail @target`.'
        : '';
      await message.reply({
        content: '<:check:1567896022028517416> Unjailed <@' + target.id + '> - by police officer <@' + message.author.id + '>' + detail,
        allowedMentions: { users: [target.id, message.author.id] },
      });
    } catch (error) {
      await message.reply({ embeds: [response(0xED4245, '<:wrong:1567909557957558292> ' + error.message)], allowedMentions: { parse: [], repliedUser: false } });
    }
  },
};
