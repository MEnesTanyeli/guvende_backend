import * as winston from 'winston';
import 'winston-daily-rotate-file';

// Format custom text outputs
const textFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

// Format JSON outputs for alerts and structured events
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// 1. Error Logs Daily Rotate: logs/error-YYYY-MM-DD.log (retention: 14 days)
export const errorLogger = winston.createLogger({
  level: 'error',
  format: textFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
    }),
  ],
});

// 2. Cron Jobs Logs Daily Rotate: logs/cron-YYYY-MM-DD.log (retention: 7 days)
export const cronLogger = winston.createLogger({
  level: 'info',
  format: textFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      filename: 'logs/cron-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d',
    }),
  ],
});

// 3. Security Events Logs Daily Rotate: logs/events-%DATE%.log (retention: 30 days)
export const eventLogger = winston.createLogger({
  level: 'info',
  format: jsonFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      filename: 'logs/events-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
  ],
});

import { LoggerService } from '@nestjs/common';

export class AppLogger implements LoggerService {
  log(message: any, context?: string) {
    if (context === 'CronService' || (typeof message === 'string' && message.includes('[CRON]'))) {
      cronLogger.info(message);
    } else if (context === 'AlertsService' || context === 'LocationsService' || context === 'BatteryService') {
      eventLogger.info({ context, message });
    } else {
      console.log(`[LOG] ${context ? `[${context}] ` : ''}${message}`);
    }
  }

  error(message: any, stack?: string, context?: string) {
    errorLogger.error(`${context ? `[${context}] ` : ''}${message}${stack ? `\nStack: ${stack}` : ''}`);
  }

  warn(message: any, context?: string) {
    console.warn(`[WARN] ${context ? `[${context}] ` : ''}${message}`);
  }

  debug(message: any, context?: string) {
    console.debug(`[DEBUG] ${context ? `[${context}] ` : ''}${message}`);
  }

  verbose(message: any, context?: string) {
    console.log(`[VERBOSE] ${context ? `[${context}] ` : ''}${message}`);
  }
}
