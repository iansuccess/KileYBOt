async function resolveTarget(message, client, argsText, kind) {
  const input = argsText.trim();
  if (!input) {
    return {
      user: await client.users.fetch(message.author.id, { force: kind === 'banner' }).catch(() => message.author),
      member: message.member,
    };
  }

  const mentionedUser = message.mentions.users.first();
  const idMatch = input.match(/^<@!?(\d{17,20})>$|^(\d{17,20})$/);
  const userId = mentionedUser?.id || (idMatch && (idMatch[1] || idMatch[2]));
  if (!userId) return null;

  const [user, member] = await Promise.all([
    client.users.fetch(userId, { force: kind === 'banner' }).catch(() => mentionedUser || null),
    message.guild.members.fetch(userId).catch(() => null),
  ]);
  if (!user) return null;
  return { user, member };
}

function getImageExtension(kind, user, member) {
  const hash = kind === 'banner' ? user.banner : (member?.avatar || user.avatar);
  return hash?.startsWith('a_') ? 'gif' : 'png';
}

function getImageUrl(kind, user, member, extension) {
  if (kind === 'banner') return user.bannerURL({ extension, size: 4096 });
  if (member) return member.displayAvatarURL({ extension, size: 4096 });
  return user.displayAvatarURL({ extension, size: 4096 });
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
  await message.reply({
    files: [{ attachment: imageUrl, name: kind + '.' + extension }],
  });
}

module.exports = { sendProfileImage };
