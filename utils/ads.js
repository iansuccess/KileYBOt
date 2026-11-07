const fs = require('node:fs');
const path = require('node:path');

const ADS_PATH = path.join(__dirname, '..', 'data', 'server-ads.json');

function readAllAdConfigurations() {
  try {
    return JSON.parse(fs.readFileSync(ADS_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function getAdConfiguration(guildId) {
  return readAllAdConfigurations()[guildId] || null;
}

function setAdConfiguration(guildId, configuration) {
  const allConfigurations = readAllAdConfigurations();
  allConfigurations[guildId] = {
    requirementText: configuration.requirementText,
    adsText: configuration.adsText,
    psPingRoleId: configuration.psPingRoleId,
    categoryId: configuration.categoryId,
  };
  fs.mkdirSync(path.dirname(ADS_PATH), { recursive: true });
  fs.writeFileSync(ADS_PATH, JSON.stringify(allConfigurations, null, 2) + '\n', 'utf8');
  return allConfigurations[guildId];
}

function isInsideAdCategory(channel, categoryId) {
  if (!channel || !categoryId) return false;
  if (channel.parentId === categoryId) return true;
  return Boolean(channel.isThread?.() && channel.parent?.parentId === categoryId);
}

async function sendAdCommand(message, commandName) {
  if (!message.guild) return;
  const configuration = getAdConfiguration(message.guild.id);
  if (!configuration || !isInsideAdCategory(message.channel, configuration.categoryId)) return;

  if (commandName === 'req' || commandName === 'ad') {
    const content = commandName === 'req' ? configuration.requirementText : configuration.adsText;
    if (!content) return;
    await message.channel.send({ content, allowedMentions: { parse: [] } });
    return;
  }

  if (commandName === 'ps') {
    const role = message.guild.roles.cache.get(configuration.psPingRoleId);
    if (!role) return;
    await message.channel.send({
      content: role.toString(),
      allowedMentions: { roles: [role.id], parse: [] },
    });
  }
}

module.exports = {
  getAdConfiguration,
  setAdConfiguration,
  isInsideAdCategory,
  sendAdCommand,
};
