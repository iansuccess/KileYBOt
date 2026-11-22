const {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');

const SERVER_COOLDOWN_MS = 8000;
const serverCooldowns = new Map();
const memberFetches = new Map();

function buildServerProfilePayload(guild, botCount) {
  const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);
  const profileDetails = [
    '<:crown1:1568098321250394233> **Owner**  <@' + guild.ownerId + '>',
    '<:Boosters:1568670811467022511> **Server Boost:** ' + (guild.premiumSubscriptionCount ?? 0),
    '**Members**  ' + guild.memberCount + '   •   **Bot Count**  ' + botCount,
    '**Server Created**  <t:' + createdTimestamp + ':F> · <t:' + createdTimestamp + ':R>',
  ].join('\n');

  const container = new ContainerBuilder();
  const profileSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('**' + guild.name + '**'));
  if (guild.description) {
    profileSection.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Description:** ' + guild.description));
  }

  const iconUrl = guild.iconURL({ size: 1024 });
  if (iconUrl) profileSection.setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl));
  container.addSectionComponents(profileSection);
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(profileDetails));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('*Лайк, a premium bot sponsored by ian </3*'));

  const bannerUrl = guild.bannerURL({ size: 512 });
  if (bannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl)),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

module.exports = {
  type: 'message',
  name: 'sp',
  aliases: ['serverprofile'],
  async execute({ message }) {
    const guild = message.guild;
    const guildId = guild.id;
    const now = Date.now();
    const cooldownUntil = serverCooldowns.get(guildId) || 0;
    if (cooldownUntil > now) {
      const secondsLeft = Math.ceil((cooldownUntil - now) / 1000);
      await message.reply('Лайк on cooldown. Try again in ' + secondsLeft + ' second' + (secondsLeft === 1 ? '' : 's') + '.');
      return;
    }
    serverCooldowns.set(guildId, now + SERVER_COOLDOWN_MS);

    const initialBotCount = guild.members.cache.filter((member) => member.user.bot).size;
    const reply = await message.reply(buildServerProfilePayload(guild, initialBotCount));

    // Display the profile immediately, then refresh the bot count in the background.
    let membersPromise = memberFetches.get(guildId);
    if (!membersPromise) {
      membersPromise = guild.members.fetch();
      memberFetches.set(guildId, membersPromise);
    }
    void membersPromise
      .then((members) => {
        const botCount = members.filter((member) => member.user.bot).size;
        if (botCount !== initialBotCount) {
          const payload = buildServerProfilePayload(guild, botCount);
          return reply.edit({ components: payload.components, allowedMentions: payload.allowedMentions });
        }
      })
      .catch((error) => {
        console.error('Could not refresh the server profile bot count:', error.message);
      })
      .finally(() => {
        if (memberFetches.get(guildId) === membersPromise) memberFetches.delete(guildId);
      });
  },
};
