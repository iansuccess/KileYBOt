const { EmbedBuilder } = require('discord.js');
const { unjailMember, hasJailCommandAccess } = require('../utils/jail');

function response(color, text) {
  return new EmbedBuilder().setColor(color).setDescription(text);
}

module.exports = {
  type: 'message',
  name: 'unjail',
  async execute({ message, argsText, currentPrefix }) {
    if (!hasJailCommandAccess(message)) return;

    const targetMatch = argsText.trim().match(/^<@!?(\d{17,20})>$|^(\d{17,20})$/);
    if (!targetMatch) {
      await message.reply({
        embeds: [response(
          0xED4245,
          '<:wrong:1567909557957558292> Use `' + currentPrefix + 'unjail @target` or `' + currentPrefix + 'unjail <user ID>`.',
        )],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const targetId = targetMatch[1] || targetMatch[2];
    const target = await message.guild.members.fetch(targetId).catch(() => null);
    if (!target) {
      await message.reply({
        embeds: [response(0xED4245, '<:wrong:1567909557957558292> I could not find that member in this server.')],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    try {
      const result = await unjailMember(message, target);
      const detail = result.failures.length
        ? ' Some saved roles or channel permissions could not be restored. Fix the bot permissions and retry `' + currentPrefix + 'unjail @target` or `' + currentPrefix + 'unjail <user ID>`.'
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