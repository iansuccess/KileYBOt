const { sendAdCommand } = require('../utils/ads');

module.exports = {
  type: 'message',
  name: 'ad',
  async execute({ message }) {
    await sendAdCommand(message, 'ad');
  },
};
