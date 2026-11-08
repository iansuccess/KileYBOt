const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./dataDir');

const SETTINGS_PATH = path.join(DATA_DIR, 'autoreact-settings.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function getAutoReactConfiguration(guildId) {
  return normalizeConfiguration(readSettings()[guildId]);
}

function normalizeConfiguration(configuration) {
  if (!configuration) return null;
  const rules = Array.isArray(configuration.rules)
    ? configuration.rules.filter((rule) => rule && typeof rule.emoji === 'string')
      .map((rule) => ({ emoji: rule.emoji, channelId: rule.channelId || null }))
    : [];
  if (rules.length === 0 && typeof configuration.emoji === 'string' && configuration.emoji) {
    rules.push({ emoji: configuration.emoji, channelId: configuration.channelId || null });
  }
  return { enabled: configuration.enabled !== false, rules };
}

function upsertAutoReactRule(guildId, emoji, channelId) {
  const settings = readSettings();
  const configuration = normalizeConfiguration(settings[guildId]) || { enabled: true, rules: [] };
  const normalizedChannelId = channelId || null;
  const existingRule = configuration.rules.find((rule) => rule.channelId === normalizedChannelId);
  if (existingRule) existingRule.emoji = emoji;
  else configuration.rules.push({ emoji, channelId: normalizedChannelId });
  configuration.enabled = true;
  settings[guildId] = configuration;
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return settings[guildId];
}

function stopAutoReact(guildId) {
  const settings = readSettings();
  const configuration = normalizeConfiguration(settings[guildId]);
  if (!configuration) return false;
  configuration.enabled = false;
  settings[guildId] = configuration;
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return true;
}

function getReactionIdentifier(emoji) {
  const customEmoji = emoji.match(/^<a?:([^:]+):(\d{17,20})>$/);
  return customEmoji ? customEmoji[1] + ':' + customEmoji[2] : emoji;
}

async function reactToMessage(message) {
  if (!message.guild || message.author?.bot) return false;
  const configuration = getAutoReactConfiguration(message.guild.id);
  if (!configuration?.enabled || configuration.rules.length === 0) return false;

  let reacted = false;
  for (const rule of configuration.rules) {
    const selectedChannelMatches = !rule.channelId ||
      message.channelId === rule.channelId ||
      (message.channel.isThread?.() && message.channel.parentId === rule.channelId);
    if (!selectedChannelMatches) continue;

    try {
      await message.react(getReactionIdentifier(rule.emoji));
      reacted = true;
    } catch {
      // Skip reactions the bot cannot add in this channel.
    }
  }
  return reacted;
}

module.exports = {
  getAutoReactConfiguration,
  upsertAutoReactRule,
  stopAutoReact,
  reactToMessage,
};
