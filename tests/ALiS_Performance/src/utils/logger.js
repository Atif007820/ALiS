export const logger = {
  line(char = '=', width = 60) {
    console.log(char.repeat(width));
  },
  section(title) {
    this.line();
    console.log(title);
    this.line();
  },
  info(message, value = undefined) {
    if (value === undefined) console.log(message);
    else console.log(`${message} ${value}`);
  },
  warn(message) {
    console.warn(message);
  },
  error(message) {
    console.error(message);
  }
};
