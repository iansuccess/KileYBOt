const { sendAdCommand } = require('../utils/ads');

module.exports = {
  type: 'message',
  name: 'ps',
  async execute({ message }) {
    await sendAdCommand(message, 'ps');
  },
};
