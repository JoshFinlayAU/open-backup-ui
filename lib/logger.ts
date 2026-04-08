/**
 * Lightweight, configurable server-side logger.
 *
 * Log level is controlled by the LOG_LEVEL environment variable (case-insensitive).
 * Valid values: debug | info | warn | error
 * Default: "debug" in development, "info" in production.
 *
 * Usage:
 *   import { createLogger } from '@/lib/logger';
 *   const logger = createLogger('MyModule');
 *   logger.debug('resolving credentials…');
 *   logger.info('authenticated', { sourceId });
 *   logger.warn('token expiring soon');
 *   logger.error('request failed', error);
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info:  1,
    warn:  2,
    error: 3,
};

function resolveConfiguredLevel(): LogLevel {
    const raw = (process.env.LOG_LEVEL ?? '').toLowerCase();
    if (raw in LEVELS) return raw as LogLevel;
    // Default: verbose in development, quieter in production
    return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
}

// Evaluated once at module load; stays in sync with env at startup.
let activeLevel: number = LEVELS[resolveConfiguredLevel()];

/** Dynamically change the active log level (useful in tests or hot-reload). */
export function setLogLevel(level: LogLevel): void {
    activeLevel = LEVELS[level];
}

/** Return the name of the currently active log level. */
export function getLogLevel(): LogLevel {
    return (Object.keys(LEVELS) as LogLevel[]).find(k => LEVELS[k] === activeLevel) ?? 'info';
}

function formatPrefix(level: LogLevel, module: string): string {
    const ts = new Date().toISOString();
    // Pad level to 5 chars for visual alignment: DEBUG INFO  WARN  ERROR
    return `[${ts}] [${level.toUpperCase().padEnd(5)}] [${module}]`;
}

function emit(level: LogLevel, module: string, message: string, ...args: unknown[]): void {
    if (LEVELS[level] < activeLevel) return;
    const prefix = formatPrefix(level, module);
    const line = `${prefix} ${message}`;
    switch (level) {
        case 'error':
            if (args.length) console.error(line, ...args); else console.error(line);
            break;
        case 'warn':
            if (args.length) console.warn(line, ...args); else console.warn(line);
            break;
        default:
            if (args.length) console.log(line, ...args); else console.log(line);
    }
}

export interface Logger {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
}

/**
 * Create a named logger for a specific module or component.
 *
 * @param module - Short identifier shown in every log line, e.g. "ProxmoxClient".
 */
export function createLogger(module: string): Logger {
    return {
        debug: (message, ...args) => emit('debug', module, message, ...args),
        info:  (message, ...args) => emit('info',  module, message, ...args),
        warn:  (message, ...args) => emit('warn',  module, message, ...args),
        error: (message, ...args) => emit('error', module, message, ...args),
    };
}
