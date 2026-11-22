const { PermissionFlagsBits, OverwriteType, ChannelType } = require('discord.js');

const EXTERNAL_APPS_PERMISSION = PermissionFlagsBits.UseExternalApps;

async function disableExternalAppsInGuild(guild) {
  await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);

  const allChannels = [...guild.channels.cache.values()].filter((channel) =>
    channel.permissionOverwrites && !channel.isThread?.(),
  );
  const categories = allChannels.filter((channel) => channel.type === ChannelType.GuildCategory);
  const categoryResults = await Promise.allSettled(categories.map((channel) => updateChannel(channel, guild)));
  const failedCategoryIds = new Set(categoryResults.flatMap((result, index) =>
    result.status === 'rejected' ? [categories[index].id] : [],
  ));

  // Synced channels inherit the category's updated overwrites. Unsynced channels
  // are processed separately so their own role settings are disabled too.
  const standaloneChannels = allChannels.filter((channel) => channel.type !== ChannelType.GuildCategory);
  const channelsToCheck = standaloneChannels.filter((channel) =>
    !(channel.parentId && channel.permissionsLocked === true && !failedCategoryIds.has(channel.parentId)),
  );
  const channelResults = await Promise.allSettled(channelsToCheck.map((channel) => updateChannel(channel, guild)));

  const updatedCategories = categoryResults.filter((result) => result.status === 'fulfilled' && result.value.changed).length;
  const updatedChannels = channelResults
    .filter((result) => result.status === 'fulfilled' && result.value.changed)
    .map((result) => result.value.channel);
  const failedChannels = [
    ...categoryResults.flatMap((result, index) => result.status === 'rejected'
      ? [{ channel: categories[index], error: result.reason }]
      : []),
    ...channelResults.flatMap((result, index) => result.status === 'rejected'
      ? [{ channel: channelsToCheck[index], error: result.reason }]
      : []),
  ];

  return {
    updatedCategoryCount: updatedCategories,
    updatedChannelCount: updatedChannels.length,
    unchangedCount: categories.length + channelsToCheck.length - updatedCategories - updatedChannels.length - failedChannels.length,
    failedChannels,
    checkedCount: categories.length + channelsToCheck.length,
  };
}

async function updateChannel(channel, guild) {
    const roles = [...guild.roles.cache.values()];
    const hasEffectiveRoleAccess = roles.some((role) =>
      channel.permissionsFor(role)?.has(EXTERNAL_APPS_PERMISSION),
    );

    const overwrites = [...channel.permissionOverwrites.cache.values()].map((overwrite) => ({
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield,
      deny: overwrite.deny.bitfield,
    }));
    let changed = false;

    function denyPermission(overwriteId, type, createIfMissing) {
      let overwrite = overwrites.find((entry) => entry.id === overwriteId);
      if (!overwrite && createIfMissing) {
        overwrite = { id: overwriteId, type, allow: 0n, deny: 0n };
        overwrites.push(overwrite);
      }
      if (!overwrite) return;

      const currentAllow = BigInt(overwrite.allow);
      const currentDeny = BigInt(overwrite.deny);
      const nextAllow = currentAllow & ~EXTERNAL_APPS_PERMISSION;
      const nextDeny = currentDeny | EXTERNAL_APPS_PERMISSION;
      if (nextAllow !== currentAllow || nextDeny !== currentDeny) changed = true;
      overwrite.allow = nextAllow;
      overwrite.deny = nextDeny;
    }

    if (hasEffectiveRoleAccess) {
      denyPermission(guild.id, OverwriteType.Role, true);
    }

    for (const overwrite of [...overwrites]) {
      if ((BigInt(overwrite.allow) & EXTERNAL_APPS_PERMISSION) === 0n) continue;
      const role = guild.roles.cache.get(overwrite.id);
      const type = role ? OverwriteType.Role : OverwriteType.Member;
      denyPermission(overwrite.id, type, false);
    }

    if (!changed) return { channel, changed: false };
    await channel.permissionOverwrites.set(overwrites, 'Anti External App setup: disable Use External Apps');
    return { channel, changed: true };
}

module.exports = { disableExternalAppsInGuild };
