export const logger = {
  section(title) {
    console.log(`\n=== ${title} ===`);
  },

  info(message) {
    console.log(`[INFO] ${message}`);
  },

  warn(message) {
    console.warn(`[WARN] ${message}`);
  },
};
