const { EmbedBuilder } = require('discord.js');
const { jailMember, hasJailCommandAccess } = require('../utils/jail');

function response(color, text) {
  return new EmbedBuilder().setColor(color).setDescription(text);
}

module.exports = {
  type: 'message',
  name: 'jail',
  async execute({ message, currentPrefix }) {
    if (!hasJailCommandAccess(message)) return;
    const target = message.mentions.members.first();
    const channel = message.mentions.channels.first();
    if (!target || !channel) {
      await message.reply({ embeds: [response(0xED4245, '<:wrong:1567909557957558292> Use `' + currentPrefix + 'jail @target #channel`. Mention the member and a regular text channel.')], allowedMentions: { repliedUser: false } });
      return;
    }
    try {
      await jailMember(message, target, channel);
      await message.reply({
        content: '<:nep_jail:1568170954050502726> Jailed <@' + target.id + '> - by police officer <@' + message.author.id + '>',
        allowedMentions: { users: [target.id, message.author.id] },
      });
    } catch (error) {
      await message.reply({ embeds: [response(0xED4245, '<:wrong:1567909557957558292> ' + error.message)], allowedMentions: { parse: [], repliedUser: false } });
    }
  },
};
