const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isPurgeSystemEnabled, isWhitelistedForAction } = require('../utils/moderation');

const MAX_PURGE_AMOUNT = 100;
const BULK_DELETE_MAX_AGE = 14 * 24 * 60 * 60 * 1000 - 60 * 1000;

module.exports = {
  type: 'message',
  name: 'purge',
  async execute({ message, argsText, currentPrefix }) {
    if (!isPurgeSystemEnabled(message.guild.id)) {
      await sendTemporaryNotice(message.channel, 'Set up purge first with `/setup purgesystem`.');
      return;
    }

    const hasWhitelistAccess = isWhitelistedForAction(
      message.guild.id,
      message.author.id,
      message.guild.ownerId,
      'purge',
      message.member,
    );
    const hasManageMessages = message.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
    if (!hasWhitelistAccess && !hasManageMessages) {
      await sendTemporaryNotice(message.channel, 'You need Manage Messages or a whitelisted role to use purge.');
      return;
    }

    const botMember = message.guild.members.me;
    if (!botMember?.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
      await sendTemporaryNotice(message.channel, 'I need the Manage Messages permission in this channel to purge messages.');
      return;
    }

    if (!message.channel.messages || typeof message.channel.bulkDelete !== 'function') {
      await sendTemporaryNotice(message.channel, 'Purge can only be used in a text channel or thread.');
      return;
    }

    const input = argsText.trim();
    const targetMatch = input.match(/^(?:<@!?(\d{17,20})>|(\d{17,20}))(?:\s+(\d+))?$/);
    try {
      let deletedCount = 0;
      let targetUserId = null;
      if (targetMatch) {
        targetUserId = targetMatch[1] || targetMatch[2];
        const amount = Number(targetMatch[3]);
        if (!targetMatch[3] || !Number.isInteger(amount) || amount < 1 || amount > MAX_PURGE_AMOUNT) {
          await sendTemporaryNotice(message.channel, 'Use `' + currentPrefix + 'purge @user <1-100>`.');
          return;
        }

        const recentMessages = await message.channel.messages.fetch({ limit: 100 });
        let matchedCount = 0;
        const targetMessages = recentMessages.filter((item) =>
          item.author.id === targetUserId &&
          Date.now() - item.createdTimestamp < BULK_DELETE_MAX_AGE &&
          matchedCount++ < amount,
        );
        deletedCount = await deleteMessageCollection(message.channel, targetMessages);
        await message.delete().catch(() => {});
      } else {
        const amount = input ? Number(input) : 5;
        if (!Number.isInteger(amount) || amount < 1 || amount > MAX_PURGE_AMOUNT) {
          await sendTemporaryNotice(message.channel, 'Use `' + currentPrefix + 'purge [1-100]` or `' + currentPrefix + 'purge @user <1-100>`.');
          return;
        }

        const recentMessages = await message.channel.messages.fetch({ limit: amount });
        const deletableMessages = recentMessages.filter((item) =>
          Date.now() - item.createdTimestamp < BULK_DELETE_MAX_AGE,
        );
        deletedCount = await deleteMessageCollection(message.channel, deletableMessages);
      }

      const messageWord = deletedCount === 1 ? 'message' : 'messages';
      const details = '**Amount purged:** ' + deletedCount + ' ' + messageWord +
        (targetUserId ? ' from <@' + targetUserId + '>' : '') +
        (deletedCount === 0 ? '\nNo recent messages could be deleted.' : '');
      const embed = new EmbedBuilder()
        .setColor(0x2B2D31)
        .setTitle('<a:News:1568651069012185138> **PURGE MESSAGE**')
        .setDescription(details + '\n**Purge by:** ' + message.author.toString());
      await sendTemporaryEmbed(message.channel, embed);
    } catch (error) {
      console.error('Purge command failed:', error.message);
      await sendTemporaryNotice(message.channel, 'I could not purge messages. Check my Manage Messages permission and try again.');
    }
  },
};

async function deleteMessageCollection(channel, messages) {
  if (messages.size === 0) return 0;
  if (messages.size === 1) {
    await messages.first().delete();
    return 1;
  }
  const deleted = await channel.bulkDelete(messages, true);
  return deleted.size;
}

async function sendTemporaryNotice(channel, content) {
  const notice = await channel.send(content).catch(() => null);
  if (notice) {
    const timer = setTimeout(() => notice.delete().catch(() => {}), 5000);
    timer.unref?.();
  }
}

async function sendTemporaryEmbed(channel, embed) {
  await channel.send({ embeds: [embed] });
}
