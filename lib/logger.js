// lib/logger.js
const pino = require('pino');
const config = require('../config'); // Assuming config/index.js exists

const isProduction = process.env.NODE_ENV === 'production';

const loggerOptions = {
  level: config.logLevel || 'info', // Default to 'info' if not in config
  // Pino includes timestamp, pid, hostname by default.
  // In JSON output for production, these are good.
  // For development, pino-pretty can simplify the output.
};

// Conditional transport for pretty printing in development
if (!isProduction) {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l', // More readable timestamp format
      ignore: 'pid,hostname', // Fields to ignore in pretty print
      levelFirst: true,       // Show level first
      messageFormat: '{levelLabel} - {msg}', // Custom message format
    },
  };
}

const logger = pino(loggerOptions);

// Log that the logger is initialized (using itself)
// Using an object for the first argument to pino allows structured logging
logger.info({
  logLevel: logger.level, // Use logger.level to get the actual level pino is using
  prettyPrint: !isProduction,
}, 'Pino logger initialized.');

module.exports = logger;
