const fs = require('node:fs');
const path = require('node:path');

const SETTINGS_PATH = path.join(__dirname, '..', 'data', 'guild-settings.json');
const WARNINGS_PATH = path.join(__dirname, '..', 'data', 'link-warnings.json');
const DEFAULT_GUILD_SETTINGS = { antiLink: false, antiNuke: false, whitelistedUsers: [], autoJoinRoleId: null };
const WHITELIST_ACTION_KEYS = [
  'antiLink',
  'creatingRole',
  'creatingChannel',
  'deletingRole',
  'deletingChannel',
  'givingAdminRole',
  'makingRoleWithAdmin',
];

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

function getGuildSettings(guildId) {
  const allSettings = readJson(SETTINGS_PATH);
  return { ...DEFAULT_GUILD_SETTINGS, ...(allSettings[guildId] || {}) };
}

function updateGuildSettings(guildId, update) {
  const allSettings = readJson(SETTINGS_PATH);
  const current = { ...DEFAULT_GUILD_SETTINGS, ...(allSettings[guildId] || {}) };
  allSettings[guildId] = { ...current, ...update };
  writeJson(SETTINGS_PATH, allSettings);
  return allSettings[guildId];
}

function setAutoJoinRole(guildId, roleId) {
  return updateGuildSettings(guildId, { autoJoinRoleId: roleId });
}

function enableProtection(guildId, ownerId) {
  return updateGuildSettings(guildId, { antiLink: true, antiNuke: true, ownerId });
}

function addWhitelistedUser(guildId, userId) {
  const settings = getGuildSettings(guildId);
  if (!settings.whitelistedUsers.includes(userId)) settings.whitelistedUsers.push(userId);
  updateGuildSettings(guildId, { whitelistedUsers: settings.whitelistedUsers });
}

function removeWhitelistedUser(guildId, userId) {
  const settings = getGuildSettings(guildId);
  const updatedUsers = settings.whitelistedUsers.filter((id) => id !== userId);
  const removed = updatedUsers.length !== settings.whitelistedUsers.length;
  updateGuildSettings(guildId, { whitelistedUsers: updatedUsers });
  return removed;
}

function isWhitelisted(guildId, userId, ownerId) {
  const settings = getGuildSettings(guildId);
  return userId === ownerId || settings.whitelistedUsers.includes(userId);
}

function isWhitelistedForAction(guildId, userId, ownerId, action, member = null) {
  if (userId === ownerId) return true;
  const settings = getGuildSettings(guildId);
  const actionSettings = settings.whitelistActions || {};
  if (!WHITELIST_ACTION_KEYS.includes(action)) return false;
  const configured = actionSettings[action];
  const enabled = typeof configured === 'boolean' ? configured : configured?.enabled !== false;
  if (!enabled) return false;
  const roleId = configured && typeof configured === 'object' ? configured.roleId : null;
  const hasRole = roleId && (member?.roles?.cache?.has(roleId) ||
    (Array.isArray(member) && member.includes(roleId)));
  return Boolean(hasRole || settings.whitelistedUsers.includes(userId));
}

function setWhitelistAction(guildId, action, enabled, roleId = undefined) {
  if (!WHITELIST_ACTION_KEYS.includes(action)) throw new Error('Unknown whitelist action.');
  const settings = getGuildSettings(guildId);
  const existing = settings.whitelistActions?.[action];
  const current = typeof existing === 'boolean'
    ? { enabled: existing, roleId: null }
    : { enabled: existing?.enabled !== false, roleId: existing?.roleId || null };
  const whitelistActions = {
    ...(settings.whitelistActions || {}),
    [action]: {
      enabled: Boolean(enabled),
      roleId: roleId === undefined ? current.roleId : roleId,
    },
  };
  return updateGuildSettings(guildId, { whitelistActions });
}

function setAllWhitelistActions(guildId, enabled, roleId = null) {
  const whitelistActions = Object.fromEntries(WHITELIST_ACTION_KEYS.map((action) => [action, {
    enabled: Boolean(enabled),
    roleId,
  }]));
  return updateGuildSettings(guildId, { whitelistActions });
}

function addLinkWarning(guildId, userId) {
  const warnings = readJson(WARNINGS_PATH);
  if (!warnings[guildId]) warnings[guildId] = {};
  warnings[guildId][userId] = (warnings[guildId][userId] || 0) + 1;
  writeJson(WARNINGS_PATH, warnings);
  return warnings[guildId][userId];
}

function resetLinkWarnings(guildId, userId) {
  const warnings = readJson(WARNINGS_PATH);
  if (!warnings[guildId]) return;
  delete warnings[guildId][userId];
  if (Object.keys(warnings[guildId]).length === 0) delete warnings[guildId];
  writeJson(WARNINGS_PATH, warnings);
}

module.exports = {
  getGuildSettings,
  enableProtection,
  setAutoJoinRole,
  addWhitelistedUser,
  removeWhitelistedUser,
  isWhitelisted,
  isWhitelistedForAction,
  setWhitelistAction,
  setAllWhitelistActions,
  WHITELIST_ACTION_KEYS,
  addLinkWarning,
  resetLinkWarnings,
};
