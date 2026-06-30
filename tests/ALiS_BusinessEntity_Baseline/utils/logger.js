export const logger = {
  info(message = '') {
    console.log(message);
  },

  error(message = '') {
    console.error(message);
  },

  warn(message = '') {
    console.warn(message);
  },

  section(title) {
    console.log(`\n${title}`);
  },

  item(message) {
    console.log(`- ${message}`);
  },
};
