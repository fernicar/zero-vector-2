import winston from 'winston';
import config from '../config.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, label, ...meta }) => {
  let logMessage = `${timestamp} [${label || 'MCP'}] ${level}: ${message}`;

  if (Object.keys(meta).length > 0) {
    logMessage += ` ${JSON.stringify(meta)}`;
  }

  return logMessage;
});

const logger = winston.createLogger({
  level: config.logging.level,
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    consoleFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        consoleFormat
      )
    })
  ]
});

export function createLogger(label) {
  return logger.child({ label });
}

export default logger;
