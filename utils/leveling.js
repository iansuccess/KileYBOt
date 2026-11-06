const fs = require('node:fs');
const path = require('node:path');

const SETTINGS_PATH = path.join(__dirname, '..', 'data', 'leveling-settings.json');
const PROGRESS_PATH = path.join(__dirname, '..', 'data', 'leveling-progress.json');
const XP_COOLDOWN_MS = 60 * 1000;
const MAX_LEVEL = 100;
const lastXpAt = new Map();

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function enableLeveling(guildId) {
  const settings = readJson(SETTINGS_PATH);
  settings[guildId] = { ...settings[guildId], enabled: true };
  writeJson(SETTINGS_PATH, settings);
}

function awardMessageXp(guildId, userId) {
  const settings = readJson(SETTINGS_PATH);
  if (!settings[guildId]?.enabled) return null;

  const cooldownKey = guildId + ':' + userId;
  const now = Date.now();
  const lastAward = lastXpAt.get(cooldownKey) || 0;
  if (now - lastAward < XP_COOLDOWN_MS) return null;

  const allProgress = readJson(PROGRESS_PATH);
  if (!allProgress[guildId]) allProgress[guildId] = {};
  const progress = allProgress[guildId][userId] || { level: 1, xp: 0 };
  if (progress.level >= MAX_LEVEL) return null;

  lastXpAt.set(cooldownKey, now);
  progress.xp += 1;
  const xpNeeded = 100 + progress.level * 10;
  if (progress.xp >= xpNeeded) {
    progress.xp -= xpNeeded;
    progress.level += 1;
    if (progress.level >= MAX_LEVEL) {
      progress.level = MAX_LEVEL;
      progress.xp = 0;
    }
    allProgress[guildId][userId] = progress;
    writeJson(PROGRESS_PATH, allProgress);
    return { level: progress.level, reachedMax: progress.level === MAX_LEVEL };
  }

  allProgress[guildId][userId] = progress;
  writeJson(PROGRESS_PATH, allProgress);
  return null;
}

module.exports = { enableLeveling, awardMessageXp };
