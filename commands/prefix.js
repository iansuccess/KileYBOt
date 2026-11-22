module.exports = {
  type: 'message',
  name: 'prefix',
  async execute({ message, argsText, currentPrefix }) {
    if (!argsText) {
      await message.reply('This server\'s prefix is ' + currentPrefix + '. Change it with ' + currentPrefix + 'prefix <new prefix>.');
      return;
    }

    if (!message.member.permissions.has('ManageGuild')) {
      await message.reply('You need the Manage Server permission to change the prefix.');
      return;
    }

    const newPrefix = argsText.trim();
    if (!newPrefix || newPrefix.length > 16) {
      await message.reply('The prefix must be between 1 and 16 characters.');
      return;
    }

    const { setPrefix } = require('../utils/prefixes');
    setPrefix(message.guild.id, newPrefix);
    await message.reply('This server\'s prefix has been changed to ' + newPrefix + '.');
  },
};
