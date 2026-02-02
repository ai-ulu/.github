/**
 * Logger utility for scheduler service
 */

import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'autoqa-scheduler' },
  transports: [
    new winston.transports.File({ filename: 'logs/scheduler-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/scheduler-combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}