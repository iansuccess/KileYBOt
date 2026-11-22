const { sendAdCommand } = require('../utils/ads');

module.exports = {
  type: 'message',
  name: 'req',
  async execute({ message }) {
    await sendAdCommand(message, 'req');
  },
};
