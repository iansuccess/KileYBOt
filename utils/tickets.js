const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { DATA_DIR } = require('./dataDir');
const { randomUUID } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const TICKET_SETTINGS_PATH = path.join(DATA_DIR, 'ticket-settings.json');
const OPEN_TICKETS_PATH = path.join(DATA_DIR, 'open-tickets.json');
const CLOSED_TICKETS_PATH = path.join(DATA_DIR, 'closed-tickets.json');
const CUSTOM_ASSET_DIR = path.join(DATA_DIR, 'ticket-panel-assets');
const DEFAULT_IMAGE_PATH = path.join(__dirname, '..', 'assets', 'default-ticket.webp');
const DEFAULT_PANEL = {
  title: 'Лайк Ticket',
  description: 'Press the button below to create a private ticket.',
  imageFile: null,
  channelId: null,
};
const PRIVATE_TICKET_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];
const pendingTicketCreations = new Set();
const pendingTicketClosures = new Set();

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function panelMapForGuild(guildId, allSettings = readJson(TICKET_SETTINGS_PATH)) {
  const guildSettings = allSettings[guildId] || {};
  if (guildSettings.panels) return guildSettings.panels;
  if (guildSettings.title || guildSettings.description || guildSettings.channelId || guildSettings.imageFile) {
    return {
      legacy: {
        id: 'legacy',
        name: guildSettings.name || 'Ticket Panel',
        ...DEFAULT_PANEL,
        ...guildSettings,
      },
    };
  }
  return {};
}

function getTicketPanels(guildId) {
  return Object.values(panelMapForGuild(guildId));
}

function getTicketPanel(guildId, panelId) {
  return panelMapForGuild(guildId)[panelId] || null;
}

function panelNameExists(guildId, name, exceptPanelId = null) {
  const normalized = name.trim().toLowerCase();
  return getTicketPanels(guildId).some((panel) => panel.id !== exceptPanelId && panel.name.trim().toLowerCase() === normalized);
}

function createTicketPanel(guildId, name, channelId) {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 80) throw new Error('Panel names must be between 1 and 80 characters.');
  if (panelNameExists(guildId, trimmedName)) throw new Error('A panel with that name already exists in this server.');
  const allSettings = readJson(TICKET_SETTINGS_PATH);
  const panels = panelMapForGuild(guildId, allSettings);
  const panelId = randomUUID();
  const panel = { id: panelId, name: trimmedName, ...DEFAULT_PANEL, title: trimmedName, channelId };
  allSettings[guildId] = { panels: { ...panels, [panelId]: panel } };
  writeJson(TICKET_SETTINGS_PATH, allSettings);
  return panel;
}

function updateTicketPanel(guildId, panelId, update) {
  const allSettings = readJson(TICKET_SETTINGS_PATH);
  const panels = panelMapForGuild(guildId, allSettings);
  if (!panels[panelId]) return null;
  panels[panelId] = { ...panels[panelId], ...update };
  allSettings[guildId] = { panels };
  writeJson(TICKET_SETTINGS_PATH, allSettings);
  return panels[panelId];
}

function deleteTicketPanel(guildId, panelId) {
  const allSettings = readJson(TICKET_SETTINGS_PATH);
  const panels = panelMapForGuild(guildId, allSettings);
  if (!panels[panelId]) return false;
  delete panels[panelId];
  allSettings[guildId] = { panels };
  writeJson(TICKET_SETTINGS_PATH, allSettings);
  return true;
}

async function saveCustomPanelImage(guildId, panelId, attachment) {
  const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
  const extensionByType = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
  };
  const contentType = (attachment.contentType || '').split(';')[0].toLowerCase();
  const extension = extensionByType[contentType] || path.extname(attachment.name || '').toLowerCase();
  if (!allowedExtensions.has(extension) || (contentType && !extensionByType[contentType])) {
    throw new Error('Choose a PNG, JPG, GIF, or WEBP image.');
  }
  if (attachment.size > 10 * 1024 * 1024) {
    throw new Error('The image must be 10 MB or smaller.');
  }

  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error('I could not download the selected image.');
  const contentTypeFromResponse = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (contentTypeFromResponse && !contentTypeFromResponse.startsWith('image/')) {
    throw new Error('The selected attachment is not an image.');
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 10 * 1024 * 1024) throw new Error('The image must be 10 MB or smaller.');

  await fsp.mkdir(CUSTOM_ASSET_DIR, { recursive: true });
  const fileName = guildId + '-' + panelId + extension;
  await fsp.writeFile(path.join(CUSTOM_ASSET_DIR, fileName), buffer);
  updateTicketPanel(guildId, panelId, { imageFile: fileName });
  return fileName;
}

function resetPanelImage(guildId, panelId) {
  updateTicketPanel(guildId, panelId, { imageFile: null });
}

function getPanelImage(guildId, panel) {
  if (panel.imageFile) {
    const safeName = path.basename(panel.imageFile);
    const customPath = path.join(CUSTOM_ASSET_DIR, safeName);
    if (fs.existsSync(customPath)) return { path: customPath, name: safeName };
  }
  if (fs.existsSync(DEFAULT_IMAGE_PATH)) return { path: DEFAULT_IMAGE_PATH, name: 'default-ticket.webp' };
  return null;
}

function makeTicketButtonRow(panelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:create:' + panelId)
      .setStyle(ButtonStyle.Primary)
      .setEmoji({ id: '1568110276182802512' })
      .setLabel('Create Ticket'),
  );
}

function buildPanelPayload(guildId, panelId, options = {}) {
  const panel = getTicketPanel(guildId, panelId);
  if (!panel) throw new Error('That ticket panel could not be found.');
  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle(panel.title === DEFAULT_PANEL.title ? panel.name : (panel.title || panel.name || DEFAULT_PANEL.title))
    .setDescription(panel.description || DEFAULT_PANEL.description);
  const image = getPanelImage(guildId, panel);
  const files = [];
  if (image) {
    embed.setImage('attachment://' + image.name);
    files.push({ attachment: image.path, name: image.name });
  }
  const components = [makeTicketButtonRow(panelId)];
  if (options.includeBringButton) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket:bring-panel:' + panelId)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji({ id: '1568110740978798613' })
        .setLabel('Bring Panel Here'),
    ));
  }
  return { embeds: [embed], components, files };
}

function readOpenTickets() {
  return readJson(OPEN_TICKETS_PATH);
}

function getOpenTicket(guildId, userId) {
  return readOpenTickets()[guildId]?.[userId] || null;
}

function setOpenTicket(guildId, userId, channelId) {
  const allTickets = readOpenTickets();
  if (!allTickets[guildId]) allTickets[guildId] = {};
  allTickets[guildId][userId] = channelId;
  writeJson(OPEN_TICKETS_PATH, allTickets);
}

function removeOpenTicket(guildId, userId) {
  const allTickets = readOpenTickets();
  if (!allTickets[guildId]) return;
  delete allTickets[guildId][userId];
  if (Object.keys(allTickets[guildId]).length === 0) delete allTickets[guildId];
  writeJson(OPEN_TICKETS_PATH, allTickets);
}

function findTicketOwner(guildId, channelId) {
  const guildTickets = readOpenTickets()[guildId] || {};
  return Object.entries(guildTickets).find(([, openChannelId]) => openChannelId === channelId)?.[0] || null;
}

function getClosedTicketOwner(guildId, channelId) {
  return readJson(CLOSED_TICKETS_PATH)[guildId]?.[channelId] || null;
}

function setClosedTicket(guildId, channelId, openerId) {
  const allClosedTickets = readJson(CLOSED_TICKETS_PATH);
  if (!allClosedTickets[guildId]) allClosedTickets[guildId] = {};
  allClosedTickets[guildId][channelId] = openerId;
  writeJson(CLOSED_TICKETS_PATH, allClosedTickets);
}

function removeClosedTicket(guildId, channelId) {
  const allClosedTickets = readJson(CLOSED_TICKETS_PATH);
  if (!allClosedTickets[guildId]) return;
  delete allClosedTickets[guildId][channelId];
  if (Object.keys(allClosedTickets[guildId]).length === 0) delete allClosedTickets[guildId];
  writeJson(CLOSED_TICKETS_PATH, allClosedTickets);
}

function createPermissionOverwrites(guild, client, userId) {
  const overwrites = new Map();
  overwrites.set(guild.id, { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] });
  const allowAccess = (id, permissions) => {
    if (!id) return;
    overwrites.set(id, { id, allow: permissions });
  };
  allowAccess(userId, PRIVATE_TICKET_PERMISSIONS);
  allowAccess(guild.ownerId, PRIVATE_TICKET_PERMISSIONS);
  allowAccess(client.user.id, [
    ...PRIVATE_TICKET_PERMISSIONS,
    PermissionFlagsBits.ManageChannels,
  ]);
  return [...overwrites.values()];
}

async function replyPrivate(interaction, content) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content });
  } else {
    await interaction.reply({ content, ephemeral: true });
  }
}

async function handleTicketButton(interaction, client) {
  if (!interaction.isButton() || !interaction.guild) return false;
  const { customId } = interaction;

  if (customId === 'ticket:bring-panel' || customId.startsWith('ticket:bring-panel:')) {
    const panelId = customId.split(':')[2] || 'legacy';
    if (interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: 'Only the server owner can publish the ticket panel.', ephemeral: true });
      return true;
    }
    if (!interaction.channel?.isTextBased() || !interaction.channel.send) {
      await interaction.reply({ content: 'I cannot publish a ticket panel in this channel.', ephemeral: true });
      return true;
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      await interaction.channel.send(buildPanelPayload(interaction.guild.id, panelId));
      await interaction.editReply({ content: 'The ticket panel was posted in this channel.' });
    } catch (error) {
      console.error('Could not publish the ticket panel:', error.message);
      await interaction.editReply({ content: 'I could not publish the panel. Check my View Channel, Send Messages, Embed Links, and Attach Files permissions.' });
    }
    return true;
  }

  if (customId === 'ticket:create' || customId.startsWith('ticket:create:')) {
    await interaction.deferReply({ ephemeral: true });
    const { guild, user, channel } = interaction;
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.editReply({ content: 'I need the Manage Channels permission to create tickets.' });
      return true;
    }

    const key = guild.id + ':' + user.id;
    if (pendingTicketCreations.has(key)) {
      await interaction.editReply({ content: 'Your ticket is already being created. Please wait a moment.' });
      return true;
    }
    pendingTicketCreations.add(key);
    try {
      const oldChannelId = getOpenTicket(guild.id, user.id);
      if (oldChannelId) {
        const oldChannel = guild.channels.cache.get(oldChannelId) || await guild.channels.fetch(oldChannelId).catch(() => null);
        if (oldChannel) {
          await interaction.editReply({ content: 'You already have an open ticket: ' + oldChannel.toString() });
          return true;
        }
        removeOpenTicket(guild.id, user.id);
      }

      const username = user.username.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'member';
      const ticketChannel = await guild.channels.create({
        name: 'ticket-' + username + '-' + interaction.id.slice(-6),
        type: ChannelType.GuildText,
        parent: channel?.parentId || undefined,
        topic: 'Private support ticket opened by ' + user.tag + ' (' + user.id + ')',
        permissionOverwrites: createPermissionOverwrites(guild, client, user.id),
        reason: 'Private ticket opened by ' + user.tag,
      });
      setOpenTicket(guild.id, user.id, ticketChannel.id);
      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:close')
          .setStyle(ButtonStyle.Danger)
          .setLabel('Close Ticket'),
      );
      try {
        await ticketChannel.send({
          content: '<@' + user.id + '> Your private ticket is ready. Describe your request here.',
          components: [closeRow],
        });
      } catch (error) {
        removeOpenTicket(guild.id, user.id);
        await ticketChannel.delete('Could not post the ticket welcome message').catch(() => {});
        throw error;
      }
      await interaction.editReply({ content: 'Your private ticket has been created: ' + ticketChannel.toString() });
    } catch (error) {
      console.error('Could not create a private ticket:', error.message);
      await interaction.editReply({ content: 'I could not create your ticket. Check my Manage Channels, View Channel, Send Messages, and role permissions.' });
    } finally {
      pendingTicketCreations.delete(key);
    }
    return true;
  }

  if (customId === 'ticket:close') {
    await interaction.deferReply({ ephemeral: true });
    const { guild, user, channel } = interaction;
    const ticketOwnerId = findTicketOwner(guild.id, channel.id);
    if (!ticketOwnerId) {
      await interaction.editReply({ content: 'This ticket is already closed or is not managed by LikeyBot.' });
      return true;
    }
    if (user.id !== ticketOwnerId && user.id !== guild.ownerId) {
      await interaction.editReply({ content: 'Only the ticket opener or server owner can close this ticket.' });
      return true;
    }
    if (pendingTicketClosures.has(channel.id)) {
      await interaction.editReply({ content: 'This ticket is already closing.' });
      return true;
    }

    pendingTicketClosures.add(channel.id);
    let ticketClosed = false;
    try {
      const disabledCloseRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:close')
          .setStyle(ButtonStyle.Secondary)
          .setLabel('Closing...')
          .setDisabled(true),
      );
      await interaction.message.edit({ components: [disabledCloseRow] });
      await channel.send('This ticket will close in 5 seconds.');
      await new Promise((resolve) => setTimeout(resolve, 5000));

      if (ticketOwnerId !== guild.ownerId) {
        await channel.permissionOverwrites.edit(ticketOwnerId, {
          ViewChannel: false,
          SendMessages: false,
        }, { reason: 'Ticket closed by ' + user.tag });
      }
      ticketClosed = true;
      setClosedTicket(guild.id, channel.id, ticketOwnerId);
      removeOpenTicket(guild.id, ticketOwnerId);
      await channel.setName(('closed-' + channel.name).slice(0, 100), 'Ticket closed by ' + user.tag).catch((error) => {
        console.error('Could not rename a closed ticket:', error.message);
      });
      const deleteRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:delete')
          .setStyle(ButtonStyle.Danger)
          .setLabel('Delete Ticket'),
      );
      await interaction.message.edit({ components: [deleteRow] });
      const closeMessage = ticketOwnerId === guild.ownerId
        ? 'The ticket is closed. An administrator can delete it with the button in the channel.'
        : 'The ticket is closed and the opener no longer has access. An administrator can delete it with the button in the channel.';
      await interaction.editReply({ content: closeMessage });
    } catch (error) {
      console.error('Could not close a ticket:', error.message);
      if (ticketClosed) {
        setClosedTicket(guild.id, channel.id, ticketOwnerId);
        removeOpenTicket(guild.id, ticketOwnerId);
        const deleteRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket:delete')
            .setStyle(ButtonStyle.Danger)
            .setLabel('Delete Ticket'),
        );
        await interaction.message.edit({ components: [deleteRow] }).catch(() => {});
        await interaction.editReply({ content: 'The ticket is closed. An administrator can delete it with the button in the channel.' });
      } else {
        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket:close')
            .setStyle(ButtonStyle.Danger)
            .setLabel('Close Ticket'),
        );
        await interaction.message.edit({ components: [closeRow] }).catch(() => {});
        await interaction.editReply({ content: 'I could not close this ticket. Check my Manage Channels permission.' });
      }
    } finally {
      pendingTicketClosures.delete(channel.id);
    }
    return true;
  }

  if (customId === 'ticket:delete') {
    await interaction.deferReply({ ephemeral: true });
    const { guild, user, channel } = interaction;
    const ticketOwnerId = getClosedTicketOwner(guild.id, channel.id);
    if (!ticketOwnerId) {
      await interaction.editReply({ content: 'This ticket is not closed or is not managed by LikeyBot.' });
      return true;
    }
    const isAdministrator = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || user.id === guild.ownerId;
    if (!isAdministrator) {
      await interaction.editReply({ content: 'Only a server administrator can delete a closed ticket.' });
      return true;
    }

    try {
      await interaction.editReply({ content: 'Deleting the closed ticket...' });
      removeClosedTicket(guild.id, channel.id);
      try {
        await channel.delete('Closed ticket deleted by ' + user.tag);
      } catch (error) {
        setClosedTicket(guild.id, channel.id, ticketOwnerId);
        throw error;
      }
      // Do not edit the interaction response after deleting its source channel.
    } catch (error) {
      console.error('Could not delete a closed ticket:', error.message);
      await interaction.editReply({ content: 'I could not delete this ticket. Check my Manage Channels permission.' }).catch(() => {});
    }
    return true;
  }

  return false;
}

module.exports = {
  buildPanelPayload,
  createTicketPanel,
  deleteTicketPanel,
  getTicketPanel,
  getTicketPanels,
  panelNameExists,
  handleTicketButton,
  resetPanelImage,
  saveCustomPanelImage,
  updateTicketPanel,
};
