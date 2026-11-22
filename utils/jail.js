const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./dataDir');
const { PermissionFlagsBits, ChannelType } = require('discord.js');

const STATE_PATH = path.join(DATA_DIR, 'jail-settings.json');
const JAILED_ROLE_NAME = 'LikeyBot Jailed';

function readAll() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

function writeAll(data) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function getGuildState(guildId) {
  const all = readAll();
  return all[guildId] || { roleId: null, members: {} };
}

function saveGuildState(guildId, state) {
  const all = readAll();
  all[guildId] = state;
  writeAll(all);
}

function isJailChannel(channel) {
  return channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type);
}

function getChannels(guild) {
  return [...guild.channels.cache.values()].filter((channel) => !channel.isThread() && channel.permissionOverwrites);
}

function serializeMemberOverwrites(guild, memberId) {
  return getChannels(guild).flatMap((channel) => {
    const overwrite = channel.permissionOverwrites.cache.get(memberId);
    if (!overwrite) return [];
    return [{
      channelId: channel.id,
      allow: overwrite.allow.bitfield.toString(),
      deny: overwrite.deny.bitfield.toString(),
    }];
  });
}

async function applyJailOverwrites(guild, role, channels = getChannels(guild)) {
  const entries = channels.map((channel) => ({ channel, options: { ViewChannel: false } }));
  const results = await Promise.allSettled(entries.map((entry) =>
    entry.channel.permissionOverwrites.edit(role, entry.options, {
      reason: 'Configure the private jail channel and hide other channels from jailed members',
    }),
  ));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  return entries.map((entry) => entry.channel.id);
}

async function clearJailOverwrites(guild, role) {
  const channels = getChannels(guild).filter((channel) => channel.permissionOverwrites.cache.has(role.id));
  const results = await Promise.allSettled(channels.map((channel) =>
    channel.permissionOverwrites.delete(role, 'Remove LikeyBot jail channel restrictions'),
  ));
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
}

async function ensureJailRole(guild, state) {
  let role = state.roleId
    ? guild.roles.cache.get(state.roleId) || await guild.roles.fetch(state.roleId).catch(() => null)
    : null;
  if (!role) {
    role = await guild.roles.create({
      name: JAILED_ROLE_NAME,
      permissions: [],
      reason: 'Create the private jail role for LikeyBot',
    });
    state.roleId = role.id;
    saveGuildState(guild.id, state);
  }
  if (role.managed || role.permissions.has(PermissionFlagsBits.Administrator)) {
    throw new Error('The configured jail role is managed or has Administrator permission. Remove it and try again.');
  }
  if (!role.editable) throw new Error('Move my highest role above the jail role and try again.');
  return role;
}

function hasJailCommandAccess(message) {
  return message.author.id === message.guild.ownerId ||
    message.member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    message.member.permissions.has(PermissionFlagsBits.Administrator);
}

function validateActor(message) {
  if (!hasJailCommandAccess(message)) {
    return 'You need Manage Roles permission to use this command.';
  }
  const botMember = message.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) ||
      !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return 'I need Manage Roles and Manage Channels permissions to use the jail system.';
  }
  return null;
}

function validateTarget(message, target) {
  if (target.id === message.guild.ownerId) return 'The server owner cannot be jailed.';
  if (target.id === message.client.user.id) return 'I cannot jail myself.';
  if (target.id === message.author.id) return 'You cannot jail yourself.';
  if (target.permissions.has(PermissionFlagsBits.Administrator)) return 'You cannot jail an Administrator.';
  if (message.author.id !== message.guild.ownerId &&
      message.member.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return 'You cannot jail a member whose highest role is equal to or above yours.';
  }
  const unmanageableRoles = target.roles.cache.filter((role) => role.id !== message.guild.id && (role.managed || !role.editable));
  if (unmanageableRoles.size) return 'I cannot temporarily remove all of this member\'s roles. Move my highest role above their roles and remove any managed roles first.';
  return null;
}

async function jailMember(message, target, jailChannel) {
  const actorError = validateActor(message);
  if (actorError) throw new Error(actorError);
  if (!isJailChannel(jailChannel) || jailChannel.guildId !== message.guild.id) {
    throw new Error('Choose a regular text or announcement channel in this server as the jail channel.');
  }
  const targetError = validateTarget(message, target);
  if (targetError) throw new Error(targetError);

  const state = getGuildState(message.guild.id);
  if (state.members[target.id]) throw new Error('This member is already jailed.');
  const role = await ensureJailRole(message.guild, state);
  if (!role.editable) throw new Error('Move my highest role above the jail role and try again.');
  const savedRoles = target.roles.cache.filter((memberRole) => memberRole.id !== message.guild.id).map((memberRole) => memberRole.id);
  const savedOverwrites = serializeMemberOverwrites(message.guild, target.id);
  const entry = { roles: savedRoles, channelId: jailChannel.id, memberOverwrites: savedOverwrites, jailedAt: new Date().toISOString() };
  const nextState = { ...state, members: { ...state.members, [target.id]: entry } };
  saveGuildState(message.guild.id, nextState);

  let overwriteChangesStarted = false;
  try {
    const configuredChannelIds = new Set(state.configuredChannelIds || []);
    const channelsToConfigure = getChannels(message.guild).filter((channel) => !configuredChannelIds.has(channel.id));
    if (channelsToConfigure.length) {
      overwriteChangesStarted = true;
      const configured = await applyJailOverwrites(message.guild, role, channelsToConfigure);
      nextState.configuredChannelIds = [...configuredChannelIds, ...configured];
      saveGuildState(message.guild.id, nextState);
    }

    const memberOverwriteResults = await Promise.allSettled(getChannels(message.guild)
      .filter((channel) => channel.permissionOverwrites.cache.has(target.id))
      .map((channel) => channel.permissionOverwrites.delete(target.id, 'Temporarily remove member-specific access while jailed')));
    const failedMemberOverwrite = memberOverwriteResults.find((result) => result.status === 'rejected');
    if (failedMemberOverwrite) throw failedMemberOverwrite.reason;

    await target.roles.set([role.id], 'Temporarily remove roles and assign the LikeyBot jail role');
    await jailChannel.permissionOverwrites.edit(target, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
      AddReactions: true, AttachFiles: true, EmbedLinks: true,
    }, { reason: 'Allow this jailed member to use their selected jail channel' });
  } catch (error) {
    if (jailChannel.permissionOverwrites.cache.has(target.id)) {
      await jailChannel.permissionOverwrites.delete(target.id, 'Roll back an incomplete jail action').catch(() => {});
    }
    await target.roles.remove(role).catch(() => {});
    const existingRoles = savedRoles.filter((id) => message.guild.roles.cache.has(id));
    await target.roles.set(existingRoles, 'Roll back an incomplete jail action').catch(() => {});
    await Promise.allSettled(savedOverwrites.map((overwrite) => {
      const channel = message.guild.channels.cache.get(overwrite.channelId);
      if (!channel?.permissionOverwrites) return Promise.resolve();
      return channel.permissionOverwrites.create(target.id, {
        allow: BigInt(overwrite.allow), deny: BigInt(overwrite.deny),
      }, { reason: 'Roll back an incomplete jail action' }).catch(() => {});
    }));
    const currentState = getGuildState(message.guild.id);
    delete currentState.members[target.id];
    saveGuildState(message.guild.id, currentState);
    if (overwriteChangesStarted && Object.keys(currentState.members).length === 0) {
      await clearJailOverwrites(message.guild, role).catch(() => {});
      await role.delete('Roll back an incomplete jail action').catch(() => {});
      currentState.roleId = null;
      saveGuildState(message.guild.id, currentState);
    }
    throw new Error('I could not jail this member. I restored any role changes that had already succeeded. ' + error.message);
  }
  return role;
}

async function restoreMemberOverwrites(guild, memberId, savedOverwrites) {
  const failures = [];
  const results = await Promise.allSettled((savedOverwrites || []).map(async (overwrite) => {
    const channel = guild.channels.cache.get(overwrite.channelId);
    if (!channel?.permissionOverwrites) return;
    await channel.permissionOverwrites.create(memberId, {
      allow: BigInt(overwrite.allow), deny: BigInt(overwrite.deny),
    }, { reason: 'Restore member-specific channel access after unjailing' });
  }));
  for (const result of results) if (result.status === 'rejected') failures.push(result.reason.message);
  return failures;
}

async function unjailMember(message, target) {
  const actorError = validateActor(message);
  if (actorError) throw new Error(actorError);
  if (target.id === message.guild.ownerId) throw new Error('The server owner cannot be unjailed by this command.');
  const state = getGuildState(message.guild.id);
  const entry = state.members[target.id];
  if (!entry) throw new Error('This member is not jailed by LikeyBot in this server.');
  const role = state.roleId
    ? message.guild.roles.cache.get(state.roleId) || await message.guild.roles.fetch(state.roleId).catch(() => null)
    : null;
  const restoredRoles = [];
  const failures = [];
  const availableRoles = (entry.roles || []).filter((id) => message.guild.roles.cache.has(id) && !target.roles.cache.has(id));
  if (availableRoles.length) {
    try {
      await target.roles.add(availableRoles, 'Restore roles saved before the member was jailed');
      restoredRoles.push(...availableRoles);
    } catch (error) {
      saveGuildState(message.guild.id, state);
      throw new Error('I could not restore the member\'s roles, so they remain jailed. Check my role permissions and hierarchy. ' + error.message);
    }
  }
  if (role && target.roles.cache.has(role.id)) {
    try { await target.roles.remove(role, 'Remove the LikeyBot jail role'); }
    catch (error) { throw new Error('I could not remove the jail role. Check my Manage Roles permission and role position. ' + error.message); }
  }
  const jailChannel = message.guild.channels.cache.get(entry.channelId);
  if (jailChannel?.permissionOverwrites?.cache.has(target.id)) {
    try {
      await jailChannel.permissionOverwrites.delete(target.id, 'Remove temporary access to the jail channel');
    } catch (error) { failures.push(error.message); }
  }
  const overwriteFailures = await restoreMemberOverwrites(message.guild, target.id, entry.memberOverwrites);
  failures.push(...overwriteFailures);

  if (failures.length === 0) delete state.members[target.id];
  if (failures.length === 0 && Object.keys(state.members).length === 0) {
    if (role) {
      try { await clearJailOverwrites(message.guild, role); }
      catch (error) { failures.push(error.message); }
      try { await role.delete('No members remain jailed by LikeyBot'); }
      catch (error) { failures.push(error.message); }
    }
    state.roleId = null;
    state.configuredChannelIds = [];
  }
  saveGuildState(message.guild.id, state);
  return { restoredRoles: restoredRoles.length, failures };
}

module.exports = { jailMember, unjailMember, validateActor, hasJailCommandAccess, isJailChannel };
