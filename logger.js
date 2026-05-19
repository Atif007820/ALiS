const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const CURRENT_LEVEL = 'info';

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[CURRENT_LEVEL];
}

function timestamp() {
  return new Date().toISOString();
}

function write(level, message, ...args) {
  if (!shouldLog(level)) return;

  const prefix = `[${timestamp()}] [${level.toUpperCase()}]`;
  const suffix = args.length
    ? ` ${args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')}`
    : '';

  const line = `${prefix} ${message}${suffix}`;
  if (level === 'warn') console.warn(line);
  else if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  debug(message, ...args) {
    write('debug', message, ...args);
  },

  info(message, ...args) {
    write('info', message, ...args);
  },

  success(message, ...args) {
    write('info', `PASS: ${message}`, ...args);
  },

  warn(message, ...args) {
    write('warn', message, ...args);
  },

  error(message, ...args) {
    write('error', message, ...args);
  },

  section(title) {
    if (!shouldLog('info')) return;
    const line = '='.repeat(72);
    console.log(`\n${line}\n${title}\n${line}`);
  },
};
