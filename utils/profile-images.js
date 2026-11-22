const {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require('discord.js');

async function getReplyTarget(message) {
  if (!message.reference?.messageId) return null;
  if (message.referencedMessage) return message.referencedMessage;
  return message.fetchReference().catch(() => null);
}

async function resolveTarget(message, client, argsText, kind) {
  const input = argsText.trim();
  let candidateUser = null;
  let member = null;
  let userId = null;

  if (!input) {
    const referencedMessage = kind === 'avatar' ? await getReplyTarget(message) : null;
    if (referencedMessage?.author) {
      candidateUser = referencedMessage.author;
      member = referencedMessage.member || message.guild?.members.cache.get(candidateUser.id) || null;
      userId = candidateUser.id;
    } else {
      candidateUser = message.author;
      member = message.member;
      userId = message.author.id;
    }
  } else {
    const mentionedUser = message.mentions.users.first();
    const idMatch = input.match(/^<@!?(\d{17,20})>$|^(\d{17,20})$/);
    userId = mentionedUser?.id || (idMatch && (idMatch[1] || idMatch[2]));
    if (!userId) return null;

    candidateUser = mentionedUser || client.users.cache.get(userId) || null;
    member = message.mentions.members.first() || message.guild?.members.cache.get(userId) || null;
  }

  // Avatar lookup uses cached Discord data and does not wait for a member-list request.
  // Banners are not included in ordinary user cache entries, so refresh that user once.
  const user = kind === 'banner'
    ? await client.users.fetch(userId, { force: true }).catch(() => candidateUser)
    : (candidateUser || await client.users.fetch(userId).catch(() => null));

  return user ? { user, member } : null;
}

function getImageExtension(kind, user, member) {
  const hash = kind === 'banner' ? user.banner : (member?.avatar || user.avatar);
  return hash?.startsWith('a_') ? 'gif' : 'png';
}

function getImageUrl(kind, user, member, extension) {
  if (kind === 'banner') return user.bannerURL({ extension, size: 2048 });
  if (member) return member.displayAvatarURL({ extension, size: 1024 });
  return user.displayAvatarURL({ extension, size: 1024 });
}

async function sendProfileImage({ client, message, argsText, kind }) {
  const target = await resolveTarget(message, client, argsText, kind);
  if (!target) return;

  const extension = getImageExtension(kind, target.user, target.member);
  const imageUrl = getImageUrl(kind, target.user, target.member, extension);
  if (!imageUrl) {
    if (kind === 'banner') {
      const notice = await message.reply('<:wrong:1567909557957558292> This user has no banner.');
      setTimeout(() => notice.delete().catch(() => {}), 3000);
    }
    return;
  }

  // Linking the CDN image in a V2 media gallery avoids downloading and re-uploading
  // the image through the bot, making avatar and banner commands respond faster.
  const container = new ContainerBuilder().addMediaGalleryComponents(
    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(imageUrl)),
  );
  await message.reply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

module.exports = { sendProfileImage };
