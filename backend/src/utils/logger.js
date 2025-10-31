/**
 * Logger Utility - Winston configuration
 */

const winston = require('winston');
const path = require('path');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'pezzy-backend' },
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// If we're in production, also write to file
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: process.env.LOG_FILE || 'logs/error.log',
      level: 'error'
    })
  );
  logger.add(
    new winston.transports.File({
      filename: process.env.LOG_FILE || 'logs/combined.log'
    })
  );
}

module.exports = logger;
