const { sendProfileImage } = require('../utils/profile-images');

module.exports = {
  type: 'message',
  name: 'av',
  async execute({ client, message, argsText }) {
    await sendProfileImage({ client, message, argsText, kind: 'avatar' });
  },
};
