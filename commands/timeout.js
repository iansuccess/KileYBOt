const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const WRONG_EMOJI = '<:wrong:1567909557957558292>';
const CLOCK_EMOJI = '<a:Clock:1567928845560975372>';
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;

function embed(color, description) {
  return new EmbedBuilder().setColor(color).setDescription(description);
}

function parseDuration(value) {
  const match = value.match(/^(\d+)([smhdwy])$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unitMs = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, y: 31536000000 }[match[2].toLowerCase()];
  if (!Number.isSafeInteger(amount) || amount < 1) return null;
  return { milliseconds: amount * unitMs, amount, unit: match[2].toLowerCase() };
}

function displayDuration(duration) {
  const names = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week', y: 'year' };
  return duration.amount + ' ' + names[duration.unit] + (duration.amount === 1 ? '' : 's');
}

module.exports = {
  type: 'message',
  name: 'timeout',
  async execute({ message, argsText, currentPrefix }) {
    const targetMatch = argsText.match(/^<@!?(\d{17,20})>|^(\d{17,20})/);
    const remaining = targetMatch ? argsText.slice(targetMatch[0].length).trim() : '';
    const duration = parseDuration(remaining);
    if (!targetMatch || !duration) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' Use `' + currentPrefix + 'timeout @user 1s`, `1m`, or `1h` (up to `28d`).')] });
      return;
    }
    if (duration.milliseconds > MAX_TIMEOUT_MS) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' Discord timeouts cannot exceed 28 days. Use `28d` or less.')] });
      return;
    }
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' You need the Moderate Members permission to use this command.')] });
      return;
    }

    const targetId = targetMatch[1] || targetMatch[2];
    const target = await message.guild.members.fetch(targetId).catch(() => null);
    if (!target) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' I could not find that member in this server.')] });
      return;
    }
    if (target.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' This user cannot be timed out because they are an administrator.')] });
      return;
    }
    if (target.id === message.author.id || (message.author.id !== message.guild.ownerId &&
        message.member.roles.highest.comparePositionTo(target.roles.highest) <= 0)) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' You cannot time out yourself or a member with an equal or higher role.')] });
      return;
    }

    const botMember = message.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ModerateMembers) || !target.moderatable) {
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' I cannot time out this member. Check my Moderate Members permission and role position.')] });
      return;
    }

    try {
      await target.timeout(duration.milliseconds, 'Timeout command used by ' + message.author.tag);
    } catch (error) {
      console.error('Could not time out a member:', error.message);
      await message.reply({ embeds: [embed(0xED4245, WRONG_EMOJI + ' I could not apply the timeout. Check my Moderate Members permission and role position.')] });
      return;
    }

    const endsAt = Math.floor((Date.now() + duration.milliseconds) / 1000);
    await message.reply({ embeds: [embed(0x57F287, CLOCK_EMOJI + ' Timed out ' + target.toString() + ' for ' + displayDuration(duration) + ' (until <t:' + endsAt + ':R>).')] });
  },
};
