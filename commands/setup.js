const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { enableProtection, setAutoJoinRole, setPurgeSystemEnabled } = require('../utils/moderation');
const { enableLeveling } = require('../utils/leveling');
const { buildPanelPayload, createTicketPanel, deleteTicketPanel } = require('../utils/tickets');
const { setLogChannel, sendServerLog } = require('../utils/logs');
const { enableStats } = require('../utils/stats');
const { setupWelcomer, saveWelcomerImage } = require('../utils/welcomer');
const { setAdConfiguration } = require('../utils/ads');
const { upsertAutoReactRule } = require('../utils/autoreact');
const { setServerBoostChannel } = require('../utils/serverBoosts');
const { disableExternalAppsInGuild } = require('../utils/externalApps');
const { addSocialMediaEntry, PLATFORM_LABELS, makeAnotherPanelRow } = require('../utils/socialMedia');
const { getPrefix } = require('../utils/prefixes');

const CHECK_EMOJI = '<:check:1567896022028517416>';

module.exports = {
  type: 'slash',
  name: 'setup',
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure LikeyBot features for this server')
    .addSubcommand((subcommand) => subcommand
      .setName('protection')
      .setDescription('Deploy Anti Link and Anti Nuke Protection'))
    .addSubcommand((subcommand) => subcommand
      .setName('autojoin')
      .setDescription('Set the role automatically assigned to new members')
      .addRoleOption((option) => option
        .setName('role')
        .setDescription('Role to assign to new members')
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('ticket')
      .setDescription('Set up a ticket panel in a channel')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Text channel where the ticket panel will be posted')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((option) => option
        .setName('panel_name')
        .setDescription('Unique panel name used to find it in /edit panel')
        .setMaxLength(80)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('logs')
      .setDescription('Set this server\'s logging channel')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Text channel where server logs will be sent')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((subcommand) => subcommand
      .setName('stats')
      .setDescription('Enable chat and voice activity tracking for this server'))
    .addSubcommand((subcommand) => subcommand
      .setName('ad')
      .setDescription('Configure requirement and advertisement commands for a category')
      .addStringOption((option) => option
        .setName('requirement_text')
        .setDescription('Text displayed by the req command')
        .setMaxLength(2000)
        .setRequired(true))
      .addStringOption((option) => option
        .setName('ads_text')
        .setDescription('Text displayed by the ad command')
        .setMaxLength(2000)
        .setRequired(true))
      .addRoleOption((option) => option
        .setName('ps_ping_role')
        .setDescription('Role mentioned by the ps command')
        .setRequired(true))
      .addChannelOption((option) => option
        .setName('category')
        .setDescription('Category where req, ad, and ps commands will work')
        .addChannelTypes(ChannelType.GuildCategory)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('purgesystem')
      .setDescription('Enable the purge command system for this server'))
    .addSubcommand((subcommand) => subcommand
      .setName('autoreact')
      .setDescription('Set an automatic reaction for this server')
      .addStringOption((option) => option
        .setName('emoji')
        .setDescription('Unicode or custom emoji to add to new messages')
        .setMaxLength(100)
        .setRequired(true))
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Leave empty to react in all channels')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)))
    .addSubcommand((subcommand) => subcommand
      .setName('serverboost')
      .setDescription('Choose where server boost notifications are sent')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Text channel for server boost notifications')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('botprofile')
      .setDescription('Set this server’s bot profile avatar')
      .addAttachmentOption((option) => option
        .setName('set')
        .setDescription('PNG, JPG, WEBP, or animated GIF for this server')
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('socialmedia')
      .setDescription('Create a separate social media panel with its profile link')
      .addStringOption((option) => option
        .setName('choice')
        .setDescription('Social media platform to add')
        .setRequired(true)
        .addChoices(
          { name: 'Instagram', value: 'instagram' },
          { name: 'Facebook', value: 'facebook' },
          { name: 'YouTube', value: 'youtube' },
          { name: 'TikTok', value: 'tiktok' },
        ))
      .addStringOption((option) => option
        .setName('link')
        .setDescription('Profile URL; optionally use {username} as a placeholder')
        .setMaxLength(500)
        .setRequired(true))
      .addStringOption((option) => option
        .setName('panel_name')
        .setDescription('Panel name used as the only argument to ,ig, ,yt, ,tt, or ,fb')
        .setMaxLength(80)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('anti-external-app')
      .setDescription('Disable Use External Apps permission across this server'))
    .addSubcommandGroup((group) => group
      .setName('welcomer')
      .setDescription('Set up or edit this server\'s welcome and exit messages')
      .addSubcommand((subcommand) => subcommand
        .setName('setup')
        .setDescription('Create the Лайк Portal category and member entrance/exit channels'))
      .addSubcommand((subcommand) => subcommand
        .setName('edit')
        .setDescription('Change the welcome and exit image')
        .addAttachmentOption((option) => option
          .setName('image')
          .setDescription('PNG, JPG, WEBP, or animated GIF image (no video)')
          .setRequired(true))))
    .addSubcommandGroup((group) => group
      .setName('leveling')
      .setDescription('Configure server leveling')
      .addSubcommand((subcommand) => subcommand
        .setName('system')
        .setDescription('Enable the leveling system for this server'))),
  async execute(interaction) {
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'botprofile' && !subcommandGroup) {
      const canManageProfile = interaction.user.id === interaction.guild.ownerId ||
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!canManageProfile) {
        await interaction.reply({ content: 'Only the server owner or an administrator can change the bot profile for this server.', ephemeral: true });
        return;
      }

      const image = interaction.options.getAttachment('set', true);
      const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
      if (!supportedTypes.has(image.contentType) || image.size > 8 * 1024 * 1024) {
        await interaction.reply({ content: 'Use a PNG, JPG, WEBP, or GIF image up to 8 MB.', ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      try {
        const response = await fetch(image.url);
        if (!response.ok) throw new Error('The uploaded image could not be downloaded.');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('The image must be no larger than 8 MB.');
        await interaction.guild.members.editMe({ avatar: bytes, reason: 'Server owner configured the guild-specific bot profile.' });
        await interaction.editReply({ content: 'The bot profile avatar was updated for this server. Other servers are unchanged.' });
      } catch (error) {
        console.error('Could not update this server’s bot profile:', error);
        await interaction.editReply({ content: 'I could not update the bot profile. Check whether Discord accepts this image and try a smaller PNG, JPG, WEBP, or GIF.' });
      }
      return;
    }

    if (subcommand === 'socialmedia' && !subcommandGroup) {
      const isOwnerOrAdmin = interaction.user.id === interaction.guild.ownerId ||
        interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
      if (!isOwnerOrAdmin) {
        await interaction.reply({ content: 'Only the server owner or an administrator can configure social media links.', ephemeral: true });
        return;
      }

      try {
        const entry = addSocialMediaEntry(interaction.guild.id, {
          platform: interaction.options.getString('choice', true),
          link: interaction.options.getString('link', true),
          panelName: interaction.options.getString('panel_name', true),
        });
        const prefix = getPrefix(interaction.guild.id);
        const commandName = { instagram: 'ig', facebook: 'fb', youtube: 'yt', tiktok: 'tt' }[entry.platform];
        await interaction.reply({
          content: PLATFORM_LABELS[entry.platform] + ' panel **' + entry.panelName + '** was added. Run `' + prefix + commandName + ' ' + entry.panelName + '` to use this panel. Existing panels were kept. Use the button below or run `/setup socialmedia` again to make another fresh panel.',
          components: [makeAnotherPanelRow()],
          ephemeral: true,
        });
      } catch (error) {
        await interaction.reply({ content: 'I could not save that social media entry. ' + error.message, ephemeral: true });
      }
      return;
    }

    if (subcommand === 'ad' && !subcommandGroup) {
      const permissions = interaction.memberPermissions;
      const hasSetupPermission = interaction.user.id === interaction.guild.ownerId ||
        permissions?.has(PermissionFlagsBits.Administrator) ||
        permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasSetupPermission) {
        await interaction.reply({ content: 'Only the server owner, an administrator, or a member with Manage Server can configure ads.', ephemeral: true });
        return;
      }

      const requirementText = interaction.options.getString('requirement_text', true).trim();
      const adsText = interaction.options.getString('ads_text', true).trim();
      const role = interaction.options.getRole('ps_ping_role', true);
      const category = interaction.options.getChannel('category', true);
      if (role.id === interaction.guild.id || role.managed) {
        await interaction.reply({ content: 'Choose a regular server role for the ps command.', ephemeral: true });
        return;
      }

      setAdConfiguration(interaction.guild.id, {
        requirementText,
        adsText,
        psPingRoleId: role.id,
        categoryId: category.id,
      });
      await interaction.reply({
        content: 'Ad commands are configured for this server. The req, ad, and ps commands will work in text channels under ' + category.toString() + '. The ps command will mention ' + role.toString() + '.',
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'purgesystem' && !subcommandGroup) {
      const permissions = interaction.memberPermissions;
      const hasSetupPermission = interaction.user.id === interaction.guild.ownerId ||
        permissions?.has(PermissionFlagsBits.Administrator) ||
        permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasSetupPermission) {
        await interaction.reply({ content: 'Only the server owner, an administrator, or a member with Manage Server can set up purge.', ephemeral: true });
        return;
      }

      setPurgeSystemEnabled(interaction.guild.id, true);
      await interaction.reply({
        content: 'Purge is enabled for this server. Members need Manage Messages or a role enabled with /whitelist purge to use it.',
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'autoreact' && !subcommandGroup) {
      const permissions = interaction.memberPermissions;
      const hasSetupPermission = interaction.user.id === interaction.guild.ownerId ||
        permissions?.has(PermissionFlagsBits.Administrator) ||
        permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasSetupPermission) {
        await interaction.reply({ content: 'Only the server owner, an administrator, or a member with Manage Server can set up auto-react.', ephemeral: true });
        return;
      }

      const emoji = interaction.options.getString('emoji', true).trim();
      const channel = interaction.options.getChannel('channel');
      if (!emoji) {
        await interaction.reply({ content: 'Provide a Unicode or custom emoji for auto-react.', ephemeral: true });
        return;
      }

      upsertAutoReactRule(interaction.guild.id, emoji, channel?.id || null);
      await interaction.reply({
        content: 'Auto-react ' + emoji + ' is configured for ' + (channel ? channel.toString() : 'all channels') + '. Settings for other channels were kept. It will react to new messages. Make sure I have Add Reactions permission in the selected channels.',
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'serverboost' && !subcommandGroup) {
      const permissions = interaction.memberPermissions;
      const hasSetupPermission = interaction.user.id === interaction.guild.ownerId ||
        permissions?.has(PermissionFlagsBits.Administrator) ||
        permissions?.has(PermissionFlagsBits.ManageGuild);
      if (!hasSetupPermission) {
        await interaction.reply({ content: 'Only the server owner, an administrator, or a member with Manage Server can set up boost notifications.', ephemeral: true });
        return;
      }

      const channel = interaction.options.getChannel('channel', true);
      const botMember = interaction.guild.members.me;
      const channelPermissions = botMember && channel.permissionsFor(botMember);
      const canSend = channelPermissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ]);
      if (!canSend) {
        await interaction.reply({ content: 'I need View Channel, Send Messages, Embed Links, and Attach Files permissions in the selected channel.', ephemeral: true });
        return;
      }

      setServerBoostChannel(interaction.guild.id, channel.id);
      await interaction.reply({
        content: 'Server boost notifications are now configured for ' + channel.toString() + '. Booster counts are tracked separately for this server.',
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'anti-external-app' && !subcommandGroup) {
      if (interaction.user.id !== interaction.guild.ownerId) {
        await interaction.reply({ content: 'Only the server owner can set up Anti External App.', ephemeral: true });
        return;
      }

      const botMember = interaction.guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.Administrator) &&
          !botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({ content: 'I need Manage Roles permission to update External Apps permission overwrites.', ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      try {
        const result = await disableExternalAppsInGuild(interaction.guild);
        const failureText = result.failedChannels.length
          ? '\nCould not update: ' + result.failedChannels.slice(0, 5).map((item) => '#' + item.channel.name).join(', ') +
            (result.failedChannels.length > 5 ? ', and ' + (result.failedChannels.length - 5) + ' more.' : '.')
          : '';
        await interaction.editReply(
          '<:check:1567896022028517416> Anti External App setup finished for this server. Updated ' +
          result.updatedCategoryCount + ' categories and ' + result.updatedChannelCount +
          ' individual channels. ' + result.unchangedCount +
          ' were already off or inherited their category settings.' + failureText,
        );
      } catch (error) {
        console.error('Anti External App setup failed:', error.message);
        await interaction.editReply('I could not finish Anti External App setup. Check my Manage Roles permission and try again.');
      }
      return;
    }

    if (interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: 'Only the server owner can use this setup command.', ephemeral: true });
      return;
    }

    if (subcommandGroup === 'welcomer' && subcommand === 'setup') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await Promise.all([interaction.guild.roles.fetch(), interaction.guild.channels.fetch()]);
        const channels = await setupWelcomer(interaction.guild);
        await interaction.editReply('The Лайк Portal category is ready with ' + channels.entrance.toString() + ' and ' + channels.exit.toString() + '. Welcome and exit settings are saved for this server.');
      } catch (error) {
        await interaction.editReply('I could not set up the welcomer. ' + error.message);
      }
      return;
    }
    if (subcommandGroup === 'welcomer' && subcommand === 'edit') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const attachment = interaction.options.getAttachment('image', true);
        await saveWelcomerImage(interaction.guild.id, attachment);
        await interaction.editReply('The welcome and exit image was updated for this server.');
      } catch (error) {
        await interaction.editReply('I could not update the welcomer image. ' + error.message);
      }
      return;
    }
    if (subcommand === 'stats') {
      await interaction.deferReply({ ephemeral: true });
      await enableStats(interaction.guild);
      await interaction.editReply({ content: 'Chat and voice activity tracking is enabled for this server. Members can use the lb and stats commands with this server\'s current prefix. Their data is stored separately for this server.' });
      return;
    }

    if (subcommand === 'logs') {
      const channel = interaction.options.getChannel('channel', true);
      const botMember = interaction.guild.members.me;
      const channelPermissions = botMember && channel.permissionsFor(botMember);
      const canLog = channelPermissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ]);
      if (!canLog) {
        await interaction.reply({ content: 'I need View Channel, Send Messages, Embed Links, and Attach Files permissions in the selected log channel.', ephemeral: true });
        return;
      }

      setLogChannel(interaction.guild.id, channel.id);
      await sendServerLog(interaction.guild, 'Server Logs Configured', 'Server activity will be logged in ' + channel.toString() + '. Embeds use red, and media attachments are posted without embeds.');
      await interaction.reply({ content: 'Server logs are now configured for ' + channel.toString() + '. Only this server\'s logs will be sent here.', ephemeral: true });
      return;
    }

    if (subcommandGroup === 'leveling' && subcommand === 'system') {
      enableLeveling(interaction.guild.id);
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Leveling System Enabled')
        .setDescription('Members earn 1 XP every 60 seconds in any text channel. XP and levels are stored separately for this server. The maximum level is 100.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }
    if (subcommand === 'ticket') {
      const channel = interaction.options.getChannel('channel', true);
      const panelName = interaction.options.getString('panel_name', true).trim();
      const botMember = interaction.guild.members.me;
      const channelPermissions = botMember && channel.permissionsFor(botMember);
      const canPost = channelPermissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ]);
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels) || !canPost) {
        await interaction.reply({ content: 'I need Manage Channels, View Channel, Send Messages, Embed Links, and Attach Files permissions to set up tickets here.', ephemeral: true });
        return;
      }

      let panel;
      try {
        panel = createTicketPanel(interaction.guild.id, panelName, channel.id);
      } catch (error) {
        await interaction.reply({ content: error.message, ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      try {
        await channel.send(buildPanelPayload(interaction.guild.id, panel.id));
        await interaction.editReply({ content: 'Ticket panel **' + panel.name + '** was posted in ' + channel.toString() + '. You can select it in /edit panel. Tickets will be placed in the same category.' });
      } catch (error) {
        deleteTicketPanel(interaction.guild.id, panel.id);
        console.error('Could not set up the ticket panel:', error.message);
        await interaction.editReply({ content: 'I could not post the ticket panel. Check my permissions in the selected channel.' });
      }
      return;
    }

    if (subcommand === 'protection') {
      enableProtection(interaction.guild.id, interaction.guild.ownerId);
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('LikeyBot has been Deployed')
        .setDescription(
          CHECK_EMOJI + ' **Anti Link** — Discord server invites and all other links are prohibited. Link messages are automatically deleted. After 3 warnings, the user receives a 10-minute timeout.\n\n' +
          CHECK_EMOJI + ' **Anti Nuke Protection** — LikeyBot punishes non-whitelisted users who add a bot, create or delete a channel or role, or add/remove an Administrator role for themselves or another member. Every new role creation triggers punishment; a new Administrator role is also deleted when possible. LikeyBot clears the offender\'s manageable roles and DMs the owner with the action details. The server owner and LikeyBot are always exempt.\n\n' +
          CHECK_EMOJI + ' LikeyBot will protect this server. $$ ian luvs you </3.'
        );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (subcommand === 'autojoin') {
      const role = interaction.options.getRole('role', true);
      const botMember = interaction.guild.members.me;
      if (role.id === interaction.guild.id || role.managed) {
        await interaction.reply({ content: 'Choose a regular server role. The @everyone and integration-managed roles cannot be auto-assigned.', ephemeral: true });
        return;
      }
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable) {
        await interaction.reply({ content: 'I cannot assign that role. Give me Manage Roles and move my highest role above the selected role.', ephemeral: true });
        return;
      }

      setAutoJoinRole(interaction.guild.id, role.id);
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('Auto Join Role Configured')
        .setDescription('New members who join this server will automatically receive ' + role.toString() + '. This setting applies only to this server.');
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
