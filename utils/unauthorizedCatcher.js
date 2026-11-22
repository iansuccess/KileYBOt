const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./dataDir');

const SETTINGS_PATH = path.join(DATA_DIR, 'unauthorized-catcher-settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function getCatcherChannelId(guildId) {
  return readSettings()[guildId]?.channelId || null;
}

function setCatcherChannel(guildId, channelId) {
  const settings = readSettings();
  settings[guildId] = { channelId };
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  const temporaryPath = SETTINGS_PATH + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporaryPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  fs.renameSync(temporaryPath, SETTINGS_PATH);
  return settings[guildId];
}

module.exports = { getCatcherChannelId, setCatcherChannel };
