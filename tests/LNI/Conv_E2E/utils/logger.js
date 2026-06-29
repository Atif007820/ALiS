import { appConfig } from '../config/runConfig.js';

/**
 * Lightweight levelled logger.
 *
 * Log level is controlled by `LOG_LEVEL` env var or defaults to `"info"`.
 * Levels (ascending): debug → info → warn → error
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[appConfig.logLevel] !== undefined ? appConfig.logLevel : 'info';

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function timestamp() {
  return new Date().toISOString();
}

function serialize(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function write(level, message, ...args) {
  if (!shouldLog(level)) return;
  const prefix = `[${timestamp()}] [${level.toUpperCase()}]`;
  const suffix = args.length ? ` ${args.map(serialize).join(' ')}` : '';
  const line   = `${prefix} ${message}${suffix}`;
  if (level === 'warn')  console.warn(line);
  else if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  /** Verbose diagnostic output. */
  debug(message, ...args)   { write('debug', message, ...args); },

  /** General informational message. */
  info(message, ...args)    { write('info',  message, ...args); },

  /** Prefixes message with "PASS:" to highlight successful actions. */
  success(message, ...args) { write('info',  `PASS: ${message}`, ...args); },

  /** Non-fatal warning. */
  warn(message, ...args)    { write('warn',  message, ...args); },

  /** Error message. */
  error(message, ...args)   { write('error', message, ...args); },

  /** Print a clearly visible section separator with a title. */
  section(title) {
    if (!shouldLog('info')) return;
    const line = '='.repeat(72);
    console.log(`\n${line}\n${title}\n${line}`);
  },
};
