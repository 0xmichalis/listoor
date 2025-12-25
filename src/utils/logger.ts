import winston from 'winston';

// Get log level from environment variable, default to 'info'
// Can be set to: error, warn, info, http, verbose, debug, silly
const logLevel = process.env.LOG_LEVEL || 'info';

// Create the logger instance
export const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `[${timestamp}] [${level.toUpperCase()}] ${message} ${metaStr}`;
        })
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
                    return `[${timestamp}] ${level} ${message} ${metaStr}`;
                })
            ),
        }),
    ],
});

// Export convenience methods
export default logger;
