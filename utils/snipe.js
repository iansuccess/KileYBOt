const recentDeletes = new Map();
const MAX_DELETES_PER_CHANNEL = 100;

function cacheKey(guildId, channelId) {
  return guildId + ':' + channelId;
}

function recordDeletedMessage(message) {
  if (!message.guild || !message.author || message.author.bot) return;
  const key = cacheKey(message.guild.id, message.channelId);
  const messages = recentDeletes.get(key) || [];
  messages.unshift({
    authorId: message.author.id,
    authorName: message.author.tag || message.author.username,
    content: message.partial ? '' : (message.content || ''),
    attachments: [...message.attachments.values()].map((attachment) => ({
      name: attachment.name || 'Attachment',
      url: attachment.url,
    })),
    deletedAt: Date.now(),
  });
  if (messages.length > MAX_DELETES_PER_CHANNEL) messages.length = MAX_DELETES_PER_CHANNEL;
  recentDeletes.set(key, messages);
}

function getDeletedMessage(guildId, channelId, authorId = null) {
  const messages = recentDeletes.get(cacheKey(guildId, channelId)) || [];
  return messages.find((entry) => !authorId || entry.authorId === authorId) || null;
}

module.exports = { recordDeletedMessage, getDeletedMessage };
