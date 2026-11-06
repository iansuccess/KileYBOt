const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const STATS_PATH = path.join(__dirname, '..', 'data', 'server-stats.json');
const LEADERBOARD_IMAGE_PATH = path.join(__dirname, '..', 'assets', 'leaderboard.png');
const COOLDOWN_MS = 5000;
const PAGE_SIZE = 3;
const MAX_RANK = 15;
const WHITE = 0xFFFFFF;
const RANK_EMOJIS = [
  '<:RB_crown:1568159828935970846>',
  '<:crown:1568159889027768361>',
  '<:bronze:1568160037195751464>',
];

function loadStats() {
  try {
    return JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

const statsData = loadStats();
const commandCooldowns = new Map();
let persistTimer = null;
let persistQueue = Promise.resolve();

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const snapshot = JSON.stringify(statsData, null, 2) + '\n';
    persistQueue = persistQueue
      .then(() => fsp.writeFile(STATS_PATH, snapshot, 'utf8'))
      .catch((error) => console.error('Could not save server activity statistics:', error.message));
  }, 500);
  persistTimer.unref?.();
}

async function flushStats() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  const snapshot = JSON.stringify(statsData, null, 2) + '\n';
  persistQueue = persistQueue
    .then(() => fsp.writeFile(STATS_PATH, snapshot, 'utf8'))
    .catch((error) => console.error('Could not save server activity statistics:', error.message));
  await persistQueue;
}

function ensureServer(guildId) {
  if (!statsData[guildId]) statsData[guildId] = { enabled: false, users: {} };
  if (!statsData[guildId].users) statsData[guildId].users = {};
  return statsData[guildId];
}

function ensureUser(server, userId, username = null) {
  if (!server.users[userId]) {
    server.users[userId] = { messages: 0, voiceSeconds: 0, voiceStartedAt: null, username };
  } else if (username) {
    server.users[userId].username = username;
  }
  return server.users[userId];
}

function isStatsEnabled(guildId) {
  return statsData[guildId]?.enabled === true;
}

async function enableStats(guild) {
  const server = ensureServer(guild.id);
  server.enabled = true;
  const now = Date.now();
  for (const voiceState of guild.voiceStates.cache.values()) {
    const member = voiceState.member;
    if (!voiceState.channelId || !member || member.user.bot) continue;
    const userStats = ensureUser(server, member.id, member.displayName);
    if (!userStats.voiceStartedAt) userStats.voiceStartedAt = now;
  }
  await flushStats();
}

async function restoreStatsEnabled(guildId, enabled) {
  const server = ensureServer(guildId);
  server.enabled = Boolean(enabled);
  await flushStats();
}

function recordChatMessage(guildId, userId, username) {
  if (!isStatsEnabled(guildId)) return;
  const userStats = ensureUser(ensureServer(guildId), userId, username);
  userStats.messages += 1;
  schedulePersist();
}

function recordVoiceStateUpdate(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const member = newState.member || oldState.member;
  if (!guild || !member || member.user.bot || !isStatsEnabled(guild.id)) return;

  const userStats = ensureUser(ensureServer(guild.id), member.id, member.displayName);
  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;
  if (oldChannelId === newChannelId) return;

  const now = Date.now();
  if (!oldChannelId && newChannelId) {
    userStats.voiceStartedAt = now;
  } else if (oldChannelId && !newChannelId) {
    if (userStats.voiceStartedAt) {
      userStats.voiceSeconds += Math.max(0, Math.floor((now - userStats.voiceStartedAt) / 1000));
    }
    userStats.voiceStartedAt = null;
  } else if (oldChannelId && newChannelId && !userStats.voiceStartedAt) {
    userStats.voiceStartedAt = now;
  }
  schedulePersist();
}

async function initializeVoiceSessions(guilds) {
  const now = Date.now();
  for (const guild of guilds) {
    const server = statsData[guild.id];
    if (!server?.enabled) continue;
    for (const userStats of Object.values(server.users)) userStats.voiceStartedAt = null;
    for (const voiceState of guild.voiceStates.cache.values()) {
      const member = voiceState.member;
      if (!voiceState.channelId || !member || member.user.bot) continue;
      ensureUser(server, member.id, member.displayName).voiceStartedAt = now;
    }
  }
  await flushStats();
}

function getUserStats(guildId, userId) {
  const userStats = statsData[guildId]?.users?.[userId];
  if (!userStats) return { messages: 0, voiceSeconds: 0 };
  const liveVoiceSeconds = userStats.voiceStartedAt
    ? Math.max(0, Math.floor((Date.now() - userStats.voiceStartedAt) / 1000))
    : 0;
  return {
    messages: userStats.messages || 0,
    voiceSeconds: (userStats.voiceSeconds || 0) + liveVoiceSeconds,
  };
}

function formatVoiceTime(totalSeconds) {
  if (totalSeconds < 60) return totalSeconds + 's';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return days + 'd ' + hours + 'h ' + minutes + 'm';
  if (hours > 0) return hours + 'h ' + minutes + 'm';
  return minutes + 'm';
}

function getLeaders(guildId) {
  const users = Object.entries(statsData[guildId]?.users || {}).map(([userId, userStats]) => {
    const liveVoiceSeconds = userStats.voiceStartedAt
      ? Math.max(0, Math.floor((Date.now() - userStats.voiceStartedAt) / 1000))
      : 0;
    return {
      userId,
      username: userStats.username || 'Member',
      messages: userStats.messages || 0,
      voiceSeconds: (userStats.voiceSeconds || 0) + liveVoiceSeconds,
    };
  });
  return {
    chat: users.filter((user) => user.messages > 0).sort((a, b) => b.messages - a.messages || a.userId.localeCompare(b.userId)).slice(0, MAX_RANK),
    voice: users.filter((user) => user.voiceSeconds > 0).sort((a, b) => b.voiceSeconds - a.voiceSeconds || a.userId.localeCompare(b.userId)).slice(0, MAX_RANK),
  };
}

function rankLines(entries, page, metric) {
  const start = page * PAGE_SIZE;
  const pageEntries = entries.slice(start, start + PAGE_SIZE);
  if (pageEntries.length === 0) return '*No activity recorded yet.*';
  return pageEntries.map((entry, offset) => {
    const rank = start + offset + 1;
    const rankLabel = RANK_EMOJIS[rank - 1] || ('**' + rank + '.**');
    const value = metric === 'chat'
      ? entry.messages.toLocaleString() + ' messages'
      : formatVoiceTime(entry.voiceSeconds);
    return rankLabel + ' <@' + entry.userId + '> — **' + value + '**';
  }).join('\n');
}

function buildLeaderboardPayload(guildId, ownerId, requestedPage = 0) {
  const leaders = getLeaders(guildId);
  const totalLeaders = Math.min(MAX_RANK, Math.max(leaders.chat.length, leaders.voice.length));
  const totalPages = Math.max(1, Math.ceil(totalLeaders / PAGE_SIZE));
  const page = Math.min(Math.max(0, requestedPage), totalPages - 1);
  const embed = new EmbedBuilder()
    .setColor(WHITE)
    .setTitle('Likey Leaderboards')
    .setDescription('Top 15 members by chat messages and voice activity.')
    .addFields(
      { name: 'Chat Messages', value: rankLines(leaders.chat, page, 'chat'), inline: true },
      { name: 'Voice Activity', value: rankLines(leaders.voice, page, 'voice'), inline: true },
    )
    .setFooter({ text: 'Page ' + (page + 1) + ' of ' + totalPages + ' • 3 ranks per page' })
    .setImage('attachment://leaderboard.png');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('stats:lb:' + guildId + ':' + ownerId + ':' + Math.max(0, page - 1) + ':previous')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('stats:lb:' + guildId + ':' + ownerId + ':' + Math.min(totalPages - 1, page + 1) + ':next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );

  return {
    embeds: [embed],
    components: [row],
    files: [{ attachment: LEADERBOARD_IMAGE_PATH, name: 'leaderboard.png' }],
  };
}

function takeCommandCooldown(guildId, userId) {
  const now = Date.now();
  const key = guildId + ':' + userId;
  const expiresAt = commandCooldowns.get(key) || 0;
  if (expiresAt > now) return Math.ceil((expiresAt - now) / 1000);
  commandCooldowns.set(key, now + COOLDOWN_MS);
  for (const [cooldownKey, time] of commandCooldowns) {
    if (time <= now) commandCooldowns.delete(cooldownKey);
  }
  return 0;
}

async function handleLeaderboardButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('stats:lb:')) return false;
  const [, , guildId, ownerId, pageValue] = interaction.customId.split(':');
  if (interaction.guildId !== guildId) {
    await interaction.reply({ content: 'This leaderboard belongs to another server.', ephemeral: true });
    return true;
  }
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: 'Only the member who opened this leaderboard can turn its pages.', ephemeral: true });
    return true;
  }
  await interaction.deferUpdate();
  await interaction.message.edit(buildLeaderboardPayload(guildId, ownerId, Number(pageValue)));
  return true;
}

module.exports = {
  enableStats,
  restoreStatsEnabled,
  isStatsEnabled,
  recordChatMessage,
  recordVoiceStateUpdate,
  initializeVoiceSessions,
  getUserStats,
  formatVoiceTime,
  buildLeaderboardPayload,
  takeCommandCooldown,
  handleLeaderboardButton,
};
