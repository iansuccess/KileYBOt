const { AFK_EMOJI, setAfk, containsDiscordInvite } = require('../utils/afk');
const { addLinkWarning, resetLinkWarnings, isWhitelistedForAction } = require('../utils/moderation');

const WRONG_EMOJI = '<:wrong:1567909557957558292>';

module.exports = {
  type: 'message',
  name: 'afk',
  async execute({ message, argsText }) {
    const reason = argsText.trim();
    if (containsDiscordInvite(reason) &&
        !isWhitelistedForAction(message.guild.id, message.author.id, message.guild.ownerId, 'antiLink', message.member)) {
      const warningCount = addLinkWarning(message.guild.id, message.author.id);
      let warningText = WRONG_EMOJI + ' Discord invite links are not allowed in AFK reasons. Warning ' + Math.min(warningCount, 3) + '/3.';
      if (warningCount >= 3) {
        try {
          const member = message.member || await message.guild.members.fetch(message.author.id);
          await member.timeout(10 * 60 * 1000, 'Three Discord invite links used in AFK reasons');
          resetLinkWarnings(message.guild.id, message.author.id);
          warningText += ' You received a 10-minute timeout.';
        } catch (error) {
          warningText += ' I could not apply the 10-minute timeout. Check my Moderate Members permission and role position.';
          console.error('Could not timeout a member for Discord invites in AFK reasons:', error.message);
        }
      }
      await message.reply({ content: warningText, allowedMentions: { repliedUser: false, parse: [] } });
      return;
    }

    setAfk(message.guild.id, message.author.id, reason);
    const response = reason
      ? AFK_EMOJI + ' You are set to AFK. Reason: ' + reason
      : AFK_EMOJI + ' You are set to AFK.';
    await message.reply({ content: response, allowedMentions: { repliedUser: false, parse: [] } });
  },
};
