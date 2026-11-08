const { sendProfileImage } = require('../utils/profile-images');

module.exports = {
  type: 'message',
  name: 'banner',
  async execute({ client, message, argsText }) {
    await sendProfileImage({ client, message, argsText, kind: 'banner' });
  },
};
