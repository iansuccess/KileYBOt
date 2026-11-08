const { EmbedBuilder, Routes } = require('discord.js');
const { performance } = require('node:perf_hooks');

const SIGNAL_EMOJI = '<:signal:1567894323943706655>';

module.exports = {
  type: 'message',
  name: 'ping',
  async execute({ client, message }) {
    const botLatency = Math.round(client.ws.ping);
    const requestStartedAt = performance.now();
    await client.rest.get(Routes.gateway());
    const serverLatency = Math.round(performance.now() - requestStartedAt);

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('pong! <a:aura7:1568096220205949008>')
      .setDescription(
        SIGNAL_EMOJI + ' **Bot:** ' + botLatency + ' ms\n' +
        SIGNAL_EMOJI + ' **Server:** ' + serverLatency + ' ms'
      );

    await message.reply({
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
  },
};
