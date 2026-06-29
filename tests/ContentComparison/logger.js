// ============================================================
// LOGGER
// Centralised logging utility.
//
// Set the LOG_LEVEL environment variable to control verbosity:
//   LOG_LEVEL=debug   → all messages
//   LOG_LEVEL=info    → default (info, warn, error)
//   LOG_LEVEL=warn    → CI-friendly (warn, error only)
//   LOG_LEVEL=error   → silent except errors
// ============================================================

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

const CURRENT_LEVEL = (process.env.LOG_LEVEL ?? 'info').toLowerCase();

function shouldLog(level) {
    return (LEVELS[level] ?? 1) >= (LEVELS[CURRENT_LEVEL] ?? 1);
}

function timestamp() {
    return new Date().toISOString();
}

function format(level, message, ...args) {
    const prefix = `[${timestamp()}] [${level.toUpperCase()}]`;
    return args.length > 0
        ? `${prefix} ${message} ${args.map(a => JSON.stringify(a)).join(' ')}`
        : `${prefix} ${message}`;
}

export const logger = {

    debug(message, ...args) {
        if (shouldLog('debug')) console.debug(format('debug', message, ...args));
    },

    info(message, ...args) {
        if (shouldLog('info')) console.info(format('info', message, ...args));
    },

    warn(message, ...args) {
        if (shouldLog('warn')) console.warn(format('warn', message, ...args));
    },

    error(message, ...args) {
        if (shouldLog('error')) console.error(format('error', message, ...args));
    },

    /** Print a prominent section banner in the terminal. */
    section(title) {
        if (shouldLog('info')) {
            const line = '═'.repeat(56);
            console.info(`\n  ${line}\n  ${title}\n  ${line}`);
        }
    },

    /** Print a one-line comparison summary. */
    summary({ matched, mismatch, missing, extra }) {
        if (shouldLog('info')) {
            console.info(format(
                'info',
                `Summary → Matched: ${matched}  Mismatch: ${mismatch}  Missing: ${missing}  Extra: ${extra}`
            ));
        }
    },
};
