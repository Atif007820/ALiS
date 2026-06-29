import runSettings from '../config/runSettings.json' with { type: 'json' };

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const configuredLevel = process.env.LOG_LEVEL || runSettings.logLevel || 'info';
const currentLevel = LEVELS[configuredLevel] ?? LEVELS.info;

function shouldLog(level) {
  return LEVELS[level] >= currentLevel;
}

function write(level, message, ...args) {
  if (!shouldLog(level)) return;
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  const suffix = args.length ? ` ${args.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(' ')}` : '';
  if (level === 'warn') console.warn(`${prefix} ${message}${suffix}`);
  else if (level === 'error') console.error(`${prefix} ${message}${suffix}`);
  else console.log(`${prefix} ${message}${suffix}`);
}

export const logger = {
  debug: (message, ...args) => write('debug', message, ...args),
  info: (message, ...args) => write('info', message, ...args),
  warn: (message, ...args) => write('warn', message, ...args),
  error: (message, ...args) => write('error', message, ...args),
  section(title) {
    if (!shouldLog('info')) return;
    const line = '='.repeat(72);
    console.log(`\n${line}\n${title}\n${line}`);
  },
};
