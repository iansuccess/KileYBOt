const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { DATA_DIR } = require('./dataDir');
const {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');

const SETTINGS_PATH = path.join(DATA_DIR, 'server-boosts.json');

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

  const container = new ContainerBuilder();
  const notification = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('**<a:notify:1568670996767051947> New Server Booster!**'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '<a:P_black_diamond:1568671681499897917> **Booster:** <@' + member.id + '>',
    ))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(member.displayAvatarURL({ size: 256 })));
  container.addSectionComponents(notification);
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    '<a:P_black_diamond:1568671681499897917> **Boost Count:** ' + boostCount + '\n' +
    '<a:P_black_diamond:1568671681499897917> **Server Boost:** ' + serverBoostCount,
  ));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    'Thank you for supporting the server! We truly appreciate your effort. Much love!',
  ));

  const files = [];
  let displayedBannerUrl = null;
  if (bannerUrl) {
    const response = await fetch(bannerUrl, { signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (response?.ok) {
      try {
        const extension = bannerHash.startsWith('a_') ? 'gif' : 'png';
        const fileName = 'server-booster-banner.' + extension;
        const source = Buffer.from(await response.arrayBuffer());
        const resizedBanner = await sharp(source, { animated: true })
          .resize({ width: 400, height: 200, fit: 'cover', position: 'attention' })
          .toBuffer();
        files.push(new AttachmentBuilder(resizedBanner, { name: fileName }));
        displayedBannerUrl = 'attachment://' + fileName;
      } catch (error) {
        console.error('Could not resize the server boost banner:', error.message);
        displayedBannerUrl = bannerUrl;
      }
    } else {
      displayedBannerUrl = bannerUrl;
    }
  }
  if (!displayedBannerUrl) {
    const defaultBannerPath = path.join(__dirname, '..', 'assets', 'server-booster-default.png');
    const resizedDefaultBanner = await sharp(fs.readFileSync(defaultBannerPath))
      .resize({ width: 400, height: 200, fit: 'cover', position: 'attention' })
      .toBuffer();
    files.push(new AttachmentBuilder(resizedDefaultBanner, { name: 'server-booster-default.png' }));
    displayedBannerUrl = 'attachment://server-booster-default.png';
  }
  container.addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(displayedBannerUrl),
    ),
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
    ...(files.length ? { files } : {}),
  };
}

module.exports = {
  getServerBoostSettings,
  setServerBoostChannel,
  recordServerBoost,
  getBoosterCount,
  buildServerBoostPayload,
};
