const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

const SETTINGS_PATH = path.join(__dirname, '..', 'data', 'server-boosts.json');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

function getServerBoostSettings(guildId) {
  return readSettings()[guildId] || null;
}

function setServerBoostChannel(guildId, channelId) {
  const settings = readSettings();
  const current = settings[guildId] || { boosterCounts: {} };
  settings[guildId] = {
    ...current,
    channelId,
    boosterCounts: current.boosterCounts || {},
  };
  writeSettings(settings);
  return settings[guildId];
}

function recordServerBoost(guildId, userId) {
  const settings = readSettings();
  const current = settings[guildId] || { channelId: null, boosterCounts: {} };
  const boosterCounts = current.boosterCounts || {};
  boosterCounts[userId] = (boosterCounts[userId] || 0) + 1;
  settings[guildId] = { ...current, boosterCounts };
  writeSettings(settings);
  return boosterCounts[userId];
}

function getBoosterCount(guildId, userId) {
  return readSettings()[guildId]?.boosterCounts?.[userId] || 0;
}

async function buildServerBoostPayload(guild, member, boostCount) {
  const refreshedGuild = await guild.fetch({ force: true, withCounts: true }).catch(() => guild);
  const serverBoostCount = refreshedGuild.premiumSubscriptionCount ?? guild.premiumSubscriptionCount ?? 0;
  const bannerHash = refreshedGuild.banner || guild.banner;
  const bannerUrl = bannerHash
    ? refreshedGuild.bannerURL({
      extension: bannerHash.startsWith('a_') ? 'gif' : 'png',
      size: 1024,
    })
    : null;
  const embed = new EmbedBuilder()
    .setTitle('<a:notify:1568670996767051947> **New Server Booster!**')
    .setDescription(
      '<a:P_black_diamond:1568671681499897917> **Booster:** <@' + member.id + '>\n\n' +
      '<a:P_black_diamond:1568671681499897917> **Boost Count:** ' + boostCount + '\n' +
      '<a:P_black_diamond:1568671681499897917> **Server Boost:** ' + serverBoostCount + '\n\n' +
      '<a:P_black_diamond:1568671681499897917> Thank you for supporting the server! We truly appreciate your effort. Much love!'
    )
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    .setImage(bannerUrl || 'attachment://server-booster-default.png');

  const payload = { embeds: [embed] };
  if (!bannerUrl) {
    payload.files = [new AttachmentBuilder(path.join(__dirname, '..', 'assets', 'server-booster-default.png'))];
  }
  return payload;
}

module.exports = {
  getServerBoostSettings,
  setServerBoostChannel,
  recordServerBoost,
  getBoosterCount,
  buildServerBoostPayload,
};
