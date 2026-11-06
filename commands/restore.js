const fs = require('node:fs/promises');
const path = require('node:path');
const { makeRestorePrompt, canRestore } = require('../utils/backup');

module.exports = {
  type: 'message',
  name: 'restore',
  async execute({ message }) {
    if (message.author.id !== message.guild.ownerId) {
      await message.reply({ content: 'Only the server owner can use this command.', allowedMentions: { repliedUser: false } });
      return;
    }
    const permissionError = canRestore(message.guild, message.member);
    if (permissionError) {
      await message.reply({ content: permissionError, allowedMentions: { repliedUser: false } });
      return;
    }
    const backupPath = path.join(__dirname, '..', 'data', 'backups', message.guild.id + '.json');
    try { await fs.access(backupPath); }
    catch {
      await message.reply({ content: 'No backup was found for this server. Run `/backup` first.', allowedMentions: { repliedUser: false } });
      return;
    }
    const prompt = makeRestorePrompt(message.guild.id, message.author.id);
    await message.reply({ ...prompt, allowedMentions: { parse: [] } });
  },
};
