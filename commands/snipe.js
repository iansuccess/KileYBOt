const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getDeletedMessage } = require('../utils/snipe');

const SEARCHING_EMOJI = '<a:Searching:1568173667299364989>';
const WRONG_EMOJI = '<:wrong:1567909557957558292>';
const WHITE = 0xFFFFFF;
const RED = 0xED4245;

function canUseSnipe(message) {
  return message.author.id === message.guild.ownerId ||
    message.member.permissions.has(PermissionFlagsBits.Administrator) ||
    message.member.permissions.has(PermissionFlagsBits.ManageMessages);
}

function clip(value, maxLength) {
  return value.length > maxLength ? value.slice(0, maxLength - 3) + '...' : value;
}

module.exports = {
  type: 'message',
  name: 'snipe',
  async execute({ message }) {
    if (!canUseSnipe(message)) {
      await message.reply({
        embeds: [new EmbedBuilder().setColor(RED).setDescription(WRONG_EMOJI + ' You need Administrator or Manage Messages permission to use this command.')],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const target = message.mentions.members.first();
    const deleted = getDeletedMessage(message.guild.id, message.channelId, target?.id || null);
    if (!deleted) {
      await message.reply({
        embeds: [new EmbedBuilder().setColor(WHITE).setDescription(SEARCHING_EMOJI + ' Sniping...\nNo deleted message is currently available to restore.')],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const description = SEARCHING_EMOJI + ' Sniping...\nAuthor: <@' + deleted.authorId + '>\n\nText:\n' +
      clip(deleted.content || 'No text content.', 3700);
    const embed = new EmbedBuilder().setColor(WHITE).setDescription(description);
    if (deleted.attachments.length) {
      const attachmentText = deleted.attachments
        .map((attachment) => '[' + clip(attachment.name, 80) + '](' + attachment.url + ')')
        .join('\n');
      embed.addFields({ name: 'Attachments', value: clip(attachmentText, 1000) });
    }
    await message.reply({ embeds: [embed], allowedMentions: { users: [deleted.authorId], repliedUser: false } });
  },
};
