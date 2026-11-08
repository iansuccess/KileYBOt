const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./dataDir');

const SETTINGS_PATH = path.join(DATA_DIR, 'guild-settings.json');
const PROTECTION_PATH = path.join(DATA_DIR, 'protection-settings.json');
const WARNINGS_PATH = path.join(DATA_DIR, 'link-warnings.json');
const DEFAULT_GUILD_SETTINGS = {
  antiLink: false,
  antiNuke: false,
  whitelistedUsers: [],
  autoJoinRoleId: null,
  purgeSystemEnabled: false,
};
const WHITELIST_ACTION_KEYS = [
  'antiLink',
  'creatingRole',
  'creatingChannel',
  'deletingRole',
  'deletingChannel',
  'givingAdminRole',
  'makingRoleWithAdmin',
  'kick',
  'ban',
  'purge',
  'addingBot',
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = filePath + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function getGuildSettings(guildId) {
  const allSettings = readJson(SETTINGS_PATH);
  const protectionSettings = readJson(PROTECTION_PATH);
  return {
    ...DEFAULT_GUILD_SETTINGS,
    ...(allSettings[guildId] || {}),
    ...(protectionSettings[guildId] || {}),
  };
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

function setPurgeSystemEnabled(guildId, enabled) {
  return updateGuildSettings(guildId, { purgeSystemEnabled: Boolean(enabled) });
}

function isPurgeSystemEnabled(guildId) {
  return Boolean(getGuildSettings(guildId).purgeSystemEnabled);
}

function enableProtection(guildId, ownerId) {
  updateGuildSettings(guildId, { antiLink: true, antiNuke: true, ownerId });

  const protectionSettings = readJson(PROTECTION_PATH);
  protectionSettings[guildId] = {
    ...(protectionSettings[guildId] || {}),
    antiLink: true,
    antiNuke: true,
    ownerId,
  };
  writeJson(PROTECTION_PATH, protectionSettings);
  return getGuildSettings(guildId);
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

function isWhitelistedForAction(guildId, userId, ownerId, action, member = null, ownerAlwaysWhitelisted = true) {
  if (ownerAlwaysWhitelisted && userId === ownerId) return true;
  const settings = getGuildSettings(guildId);
  const actionSettings = settings.whitelistActions || {};
  if (!WHITELIST_ACTION_KEYS.includes(action)) return false;
  const configured = actionSettings[action];
  const enabled = typeof configured === 'boolean' ? configured : configured?.enabled !== false;
  if (!enabled) return false;
  const roleIds = getConfiguredRoleIds(configured);
  const hasRole = roleIds.some((roleId) => roleId !== guildId && (member?.roles?.cache?.has(roleId) ||
    (Array.isArray(member) && member.includes(roleId))));
  return Boolean(hasRole || (action !== 'antiLink' && settings.whitelistedUsers.includes(userId)));
}

function getConfiguredRoleIds(configured) {
  if (!configured || typeof configured !== 'object') return [];
  const roleIds = Array.isArray(configured.roleIds) ? [...configured.roleIds] : [];
  if (configured.roleId) roleIds.push(configured.roleId);
  return [...new Set(roleIds.filter(Boolean))];
}

function appendRoleId(roleIds, roleId) {
  if (!roleId || roleIds.includes(roleId)) return roleIds;
  return [...roleIds, roleId];
}

function setWhitelistAction(guildId, action, enabled, roleId = undefined) {
  if (!WHITELIST_ACTION_KEYS.includes(action)) throw new Error('Unknown whitelist action.');
  if (enabled && roleId === guildId) throw new Error('The @everyone role cannot be whitelisted. Choose a specific role.');
  const settings = getGuildSettings(guildId);
  const existing = settings.whitelistActions?.[action];
  const roleIds = getConfiguredRoleIds(existing);
  const whitelistActions = {
    ...(settings.whitelistActions || {}),
    [action]: {
      enabled: Boolean(enabled),
      roleIds: enabled ? appendRoleId(roleIds, roleId) : roleIds,
    },
  };
  return updateGuildSettings(guildId, { whitelistActions });
}

function setAllWhitelistActions(guildId, enabled, roleId = null) {
  if (enabled && roleId === guildId) throw new Error('The @everyone role cannot be whitelisted. Choose a specific role.');
  const settings = getGuildSettings(guildId);
  const currentActions = settings.whitelistActions || {};
  const whitelistActions = Object.fromEntries(WHITELIST_ACTION_KEYS.map((action) => {
    const currentRoleIds = getConfiguredRoleIds(currentActions[action]);
    return [action, {
      enabled: Boolean(enabled),
      roleIds: enabled ? appendRoleId(currentRoleIds, roleId) : currentRoleIds,
    }];
  }));
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
  setPurgeSystemEnabled,
  isPurgeSystemEnabled,
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
