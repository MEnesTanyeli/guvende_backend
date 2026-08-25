import { LoggerService } from '@nestjs/common';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

function stringifyLogMessage(message: unknown): string {
  return typeof message === 'string' ? message : JSON.stringify(message);
}

// Format custom text outputs
const textFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${String(timestamp)} [${level.toUpperCase()}]: ${String(message)}`;
  }),
);

// Format JSON outputs for alerts and structured events
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
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

export class AppLogger implements LoggerService {
  log(message: unknown, context?: string) {
    const text = stringifyLogMessage(message);
    if (
      context === 'CronService' ||
      (typeof message === 'string' && message.includes('[CRON]'))
    ) {
      cronLogger.info(text);
    } else if (
      context === 'AlertsService' ||
      context === 'LocationsService' ||
      context === 'BatteryService'
    ) {
      eventLogger.info({ context, message });
    } else {
      console.log(`[LOG] ${context ? `[${context}] ` : ''}${text}`);
    }
  }

  error(message: unknown, stack?: string, context?: string) {
    const text = stringifyLogMessage(message);
    errorLogger.error(
      `${context ? `[${context}] ` : ''}${text}${stack ? `\nStack: ${stack}` : ''}`,
    );
  }

  warn(message: unknown, context?: string) {
    console.warn(
      `[WARN] ${context ? `[${context}] ` : ''}${stringifyLogMessage(message)}`,
    );
  }

  debug(message: unknown, context?: string) {
    console.debug(
      `[DEBUG] ${context ? `[${context}] ` : ''}${stringifyLogMessage(message)}`,
    );
  }

  verbose(message: unknown, context?: string) {
    console.log(
      `[VERBOSE] ${context ? `[${context}] ` : ''}${stringifyLogMessage(message)}`,
    );
  }
}
