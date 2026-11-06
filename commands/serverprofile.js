const { EmbedBuilder } = require('discord.js');

const SERVER_COOLDOWN_MS = 8000;
const serverCooldowns = new Map();

module.exports = {
  type: 'message',
  name: 'sp',
  aliases: ['serverprofile'],
  async execute({ message }) {
    const guildId = message.guild.id;
    const now = Date.now();
    const cooldownUntil = serverCooldowns.get(guildId) || 0;
    if (cooldownUntil > now) {
      const secondsLeft = Math.ceil((cooldownUntil - now) / 1000);
      await message.reply('Лайк on cooldown. Try again in ' + secondsLeft + ' second' + (secondsLeft === 1 ? '' : 's') + '.');
      return;
    }
    serverCooldowns.set(guildId, now + SERVER_COOLDOWN_MS);

    let members;
    try {
      members = await message.guild.members.fetch();
    } catch (error) {
      console.error('Could not fetch the full server member list:', error.message);
      await message.reply('Im cooldown for a reason try again later.');
      return;
    }

    const botCount = members.filter((member) => member.user.bot).size;
    const createdTimestamp = Math.floor(message.guild.createdTimestamp / 1000);
    const embed = new EmbedBuilder()
      .setColor('#FFFFFF')
      .setTitle('<:profile:1568090888092258384> ' + message.guild.name)
      .addFields(
        { name: '<:crown1:1568098321250394233> Owner', value: '<@' + message.guild.ownerId + '>', inline: true },
        { name: 'Members', value: String(message.guild.memberCount), inline: true },
        { name: 'Bot Count', value: String(botCount), inline: true },
        { name: 'Server Created', value: '<t:' + createdTimestamp + ':F>\n<t:' + createdTimestamp + ':R>', inline: false },
      )
      .setFooter({ text: 'Лайк, a premium bot sponsored by ian </3' });

    if (message.guild.description) embed.setDescription(message.guild.description);
    const iconUrl = message.guild.iconURL({ size: 1024 });
    if (iconUrl) embed.setThumbnail(iconUrl);

    const bannerUrl = message.guild.bannerURL({ size: 1024 });
    if (bannerUrl) embed.setImage(bannerUrl);
    await message.reply({ embeds: [embed] });
  },
};
