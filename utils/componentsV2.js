const {
  BaseGuildTextChannel,
  BaseGuildVoiceChannel,
  CommandInteraction,
  ContainerBuilder,
  DMChannel,
  GuildMember,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  Message,
  MessageComponentInteraction,
  MessageFlags,
  ModalSubmitInteraction,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThreadChannel,
  User,
  Webhook,
} = require('discord.js');

function componentPanel(title, body) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ' + title))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body));

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function splitText(text, maxLength = 3900) {
  const chunks = [];
  let remaining = String(text || '').trim();
  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt < maxLength / 2) splitAt = remaining.lastIndexOf(' ', maxLength);
    if (splitAt < maxLength / 2) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function embedToContainer(embedData) {
  const lines = [];
  const author = embedData.author;
  if (author?.name) {
    lines.push(author.url ? '**[' + author.name + '](' + author.url + ')**' : '**' + author.name + '**');
  }

  if (embedData.title) {
    lines.push(embedData.url ? '**[' + embedData.title + '](' + embedData.url + ')**' : '**' + embedData.title + '**');
  } else if (!author?.name) {
    lines.push('**<a:notify:1568670996767051947> New Notification**');
  }

  const body = [];
  if (embedData.description) body.push(embedData.description);
  for (const field of embedData.fields || []) {
    body.push('**' + field.name + '**\n' + field.value);
  }
  if (embedData.footer?.text) body.push('*' + embedData.footer.text + '*');
  if (embedData.timestamp) {
    const timestamp = Math.floor(new Date(embedData.timestamp).getTime() / 1000);
    if (Number.isFinite(timestamp)) body.push('<t:' + timestamp + ':f>');
  }

  const container = new ContainerBuilder();
  const heading = lines.join('\n');
  if (heading) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(heading));
  if (heading && body.length) container.addSeparatorComponents(new SeparatorBuilder());
  for (const chunk of splitText(body.join('\n\n'))) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk));
  }

  const mediaItems = [];
  if (embedData.thumbnail?.url) {
    mediaItems.push(new MediaGalleryItemBuilder().setURL(embedData.thumbnail.url));
  }
  if (embedData.image?.url) {
    mediaItems.push(new MediaGalleryItemBuilder().setURL(embedData.image.url));
  }
  if (mediaItems.length) container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(mediaItems));
  return container;
}

function withComponentsV2Flag(flags) {
  if (Array.isArray(flags)) return [...flags, MessageFlags.IsComponentsV2];
  if (typeof flags === 'string') return [flags, MessageFlags.IsComponentsV2];
  if (typeof flags === 'number') return flags | MessageFlags.IsComponentsV2;
  if (typeof flags === 'bigint') return Number(flags | BigInt(MessageFlags.IsComponentsV2));
  if (flags && typeof flags.bitfield === 'number') return flags.bitfield | MessageFlags.IsComponentsV2;
  return MessageFlags.IsComponentsV2;
}

function toComponentsV2Payload(options) {
  if (!options || typeof options !== 'object' || !Array.isArray(options.embeds) || options.embeds.length === 0) {
    return options;
  }

  const embeds = options.embeds.map((embed) => typeof embed?.toJSON === 'function' ? embed.toJSON() : embed);
  const components = [];
  if (options.content) {
    for (const chunk of splitText(options.content)) {
      const contentContainer = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk));
      components.push(contentContainer);
    }
  }
  components.push(...embeds.map(embedToContainer));
  components.push(...(options.components || []));

  const converted = { ...options };
  delete converted.content;
  delete converted.embeds;
  converted.components = components;
  converted.flags = withComponentsV2Flag(options.flags);
  if (!converted.allowedMentions) converted.allowedMentions = { parse: [] };
  return converted;
}

function wrapPayloadMethod(prototype, methodName, optionsIndex = 0) {
  if (!prototype || typeof prototype[methodName] !== 'function') return;
  const original = prototype[methodName];
  if (original.__componentsV2LayoutWrapped) return;

  const wrapped = function (...args) {
    args[optionsIndex] = toComponentsV2Payload(args[optionsIndex]);
    return original.apply(this, args);
  };
  Object.defineProperty(wrapped, '__componentsV2LayoutWrapped', { value: true });
  prototype[methodName] = wrapped;
}

function installComponentsV2Layout() {
  for (const channelClass of [BaseGuildTextChannel, BaseGuildVoiceChannel, DMChannel, ThreadChannel, User, GuildMember]) {
    wrapPayloadMethod(channelClass?.prototype, 'send');
  }
  wrapPayloadMethod(Message.prototype, 'reply');
  wrapPayloadMethod(Message.prototype, 'edit');
  wrapPayloadMethod(Webhook.prototype, 'send');
  wrapPayloadMethod(Webhook.prototype, 'editMessage', 1);
  for (const interactionClass of [CommandInteraction, MessageComponentInteraction, ModalSubmitInteraction]) {
    for (const method of ['reply', 'editReply', 'followUp', 'update']) {
      wrapPayloadMethod(interactionClass?.prototype, method);
    }
  }
}

module.exports = { componentPanel, installComponentsV2Layout };
