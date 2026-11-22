const { PermissionFlagsBits } = require('discord.js');
const { componentPanel } = require('../utils/componentsV2');

const DIAMOND = '<a:P_black_diamond:1568671681499897917>';
const WRONG = '<:wrong:1567909557957558292>';
const CHECK = '<:check:1567896022028517416>';
const CUSTOM_EMOJI_PATTERN = /<(a?):([A-Za-z0-9_]{2,32}):(\d{17,20})>/;
const MAX_EMOJI_IMAGE_BYTES = 8 * 1024 * 1024;

function canManageExpressions(member, guild) {
  return member?.id === guild.ownerId ||
    Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      member?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions));
}

async function replyPanel(message, title, body) {
  await message.reply({
    ...componentPanel(title, body),
    allowedMentions: { parse: [], repliedUser: false },
  });
}

module.exports = {
  type: 'message',
  name: 'add',
  async execute({ message, argsText, currentPrefix }) {
    const input = argsText.trim();
    const subcommand = input.match(/^emoji\b/i);
    if (!subcommand) return;

    const emojiText = input.slice(subcommand[0].length).trim();
    const match = CUSTOM_EMOJI_PATTERN.exec(emojiText);
    if (!match) {
      await replyPanel(
        message,
        WRONG + ' Add Emoji',
        'Use `' + currentPrefix + 'add emoji <:emoji_name:emoji_id>` or `' + currentPrefix + 'add emoji <a:animated_name:emoji_id> [new_name]`.\nOnly custom Discord emojis can be added; Unicode emojis are already available everywhere.',
      );
      return;
    }

    if (!canManageExpressions(message.member, message.guild)) {
      await replyPanel(message, WRONG + ' Add Emoji', 'You need Manage Expressions permission to add emojis to this server.');
      return;
    }

    const botMember = message.guild.members.me;
    const botCanManageExpressions = botMember?.permissions?.any(
      PermissionFlagsBits.ManageGuildExpressions | PermissionFlagsBits.CreateGuildExpressions,
    );
    if (!botCanManageExpressions) {
      await replyPanel(message, WRONG + ' Add Emoji', 'I need Create Expressions or Manage Expressions permission to add emojis to this server.');
      return;
    }

    const providedName = emojiText.slice(match.index + match[0].length).trim().split(/\s+/)[0];
    const requestedName = providedName || match[2];
    const emojiName = requestedName.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
    if (emojiName.length < 2) {
      await replyPanel(message, WRONG + ' Add Emoji', 'Emoji names must be 2 to 32 letters, numbers, or underscores.');
      return;
    }

    const emojiId = match[3];
    const extension = match[1] ? 'gif' : 'png';
    const emojiUrl = 'https://cdn.discordapp.com/emojis/' + emojiId + '.' + extension + '?size=1024&quality=lossless';
    try {
      const response = await fetch(emojiUrl);
      if (!response.ok) {
        await replyPanel(message, WRONG + ' Add Emoji', 'I could not access that emoji. Make sure the custom emoji is valid and available.');
        return;
      }
      const imageBuffer = Buffer.from(await response.arrayBuffer());
      if (imageBuffer.length === 0 || imageBuffer.length > MAX_EMOJI_IMAGE_BYTES) {
        await replyPanel(message, WRONG + ' Add Emoji', 'That emoji image is empty or too large to add.');
        return;
      }

      const createdEmoji = await message.guild.emojis.create({
        attachment: imageBuffer,
        name: emojiName,
        reason: 'Emoji added by ' + message.author.tag,
      });
      const emojiCount = message.guild.emojis.cache.size;
      await replyPanel(
        message,
         ' Emoji Added',
        DIAMOND + ' **emoji:** ' + createdEmoji.toString() + '\n' +
        DIAMOND + ' **server emoji count:** ' + emojiCount,
      );
    } catch (error) {
      console.error('Could not add a custom emoji:', error.message);
      const detail = error.code === 30008
        ? 'This server has reached its emoji limit.'
        : 'I could not add that emoji. Check that it is valid, that the server has a free emoji slot, and that I have the required permission.';
      await replyPanel(message, WRONG + ' Add Emoji', detail);
    }
  },
};