const fs = require('node:fs');
const path = require('node:path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require('discord.js');

const COMMANDS_DIR = __dirname;
const HELP_COOLDOWN_MS = 10_000;
const HELP_EMOJI = '<a:P_black_diamond:1568671681499897917>';
const cooldowns = new Map();

function loadCommands() {
  const loaded = [];
  for (const file of fs.readdirSync(COMMANDS_DIR).filter((name) => name.endsWith('.js'))) {
    try {
      loaded.push(require(path.join(COMMANDS_DIR, file)));
    } catch (error) {
      console.error('Could not load command for help menu (' + file + '):', error.message);
    }
  }
  return loaded;
}

function getSlashCommandLines(commands) {
  return commands
    .filter((command) => command.type === 'slash' && command.data)
    .map((command) => {
      const definition = command.data.toJSON();
      const subcommands = (definition.options || [])
        .map((option) => {
          if (option.type === 1) return '/' + definition.name + ' ' + option.name;
          if (option.type === 2) {
            return (option.options || []).map((subcommand) => '/' + definition.name + ' ' + option.name + ' ' + subcommand.name);
          }
          return null;
        })
        .flat()
        .filter(Boolean);
      return subcommands.length ? subcommands : ['/' + definition.name];
    })
    .flat()
    .sort((left, right) => left.localeCompare(right));
}

function makeHelpContainer(prefix, commands) {
  const utils = commands
    .filter((command) => command.type === 'message' && command.name && command.name !== 'help')
    .map((command) => {
      const names = [command.name, ...(command.aliases || [])];
      return names.map((name) => '**' + prefix + name + '**').join(' / ');
    })
    .sort((left, right) => left.localeCompare(right));
  const slash = getSlashCommandLines(commands).map((name) => '**' + name + '**');

  const setupGuide = [
    '**/setup protection** — turn on Anti Link and Anti Nuke protection.',
    '**/setup autojoin role** — choose the role new members receive.',
    '**/setup ticket channel panel_name** — create a ticket panel; edit it with **/edit panel**.',
    '**/setup logs channel** — choose this server’s log channel.',
    '**/setup stats** — enable this server’s activity tracking; use **' + prefix + 'stats** or **' + prefix + 'lb**.',
    '**/setup ad** — set the requirement text, ad text, ping role, and category for **' + prefix + 'req**, **' + prefix + 'ad**, and **' + prefix + 'ps**.',
    '**/setup purgesystem** — enable **' + prefix + 'purge**.',
    '**/setup autoreact emoji** — set an emoji; optionally choose a channel.',
    '**/setup serverboost channel** — choose where boost notifications go.',
    '**/setup botprofile set** — upload this server’s bot profile image.',
    '**/setup socialmedia** — add a social media link and panel name.',
    '**/setup anti-external-app** — disable external app permissions in this server.',
    '**/setup welcomer setup** — create the welcome and exit channels; use **/setup welcomer edit** to change their image.',
    '**/setup leveling system** — enable this server’s leveling system.',
    '**/unauthorize catcher channel** — select where unauthorized activity alerts appear.',
    '**/serverboostperks** — post boost perks in a selected channel (server owner only).',
  ].join('\n');

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Лайк Help'))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      HELP_EMOJI + ' **Command**\n' + (utils.length ? utils.join('  ') : 'No prefix commands found.') +
      '\n\n**Slash Commands**\n' + (slash.length ? slash.join('  ') : 'No slash commands found.')
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      HELP_EMOJI + ' **Utils**\n' + setupGuide
    ));

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Open Invite Link')
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.gg/SjwgQSTgAF'),
    ),
  );

  return container;
}

module.exports = {
  type: 'message',
  name: 'help',
  async execute({ message, currentPrefix }) {
    const now = Date.now();
    const cooldownKey = message.guild.id + ':' + message.author.id;
    const cooldownUntil = cooldowns.get(cooldownKey) || 0;
    if (cooldownUntil > now) return;

    cooldowns.set(cooldownKey, now + HELP_COOLDOWN_MS);
    setTimeout(() => {
      if (cooldowns.get(cooldownKey) <= Date.now()) cooldowns.delete(cooldownKey);
    }, HELP_COOLDOWN_MS + 100).unref?.();

    await message.reply({
      components: [makeHelpContainer(currentPrefix, loadCommands())],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  },
};
