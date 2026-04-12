/**
 * Winston logger factory.
 *
 * Extracted from: trendforge-orchestration/src/config/logger.ts
 *
 * Usage:
 *   import { createLogger } from '@cu2/shared-lib/api/logger';
 *
 *   const logger = createLogger({ service: 'my-api' });
 *   logger.info('Server started', { port: 3000 });
 */

import winston from 'winston';

export interface LoggerOptions {
  /** Service name for structured logs */
  service: string;
  /** Log level (default: from LOG_LEVEL env var, or 'info') */
  level?: string;
  /** Pretty-print in dev (default: true if NODE_ENV !== 'production') */
  pretty?: boolean;
}

export function createLogger(opts: LoggerOptions): winston.Logger {
  const isProd = process.env['NODE_ENV'] === 'production';
  const level = opts.level ?? process.env['LOG_LEVEL'] ?? 'info';
  const pretty = opts.pretty ?? !isProd;

  const formats = [
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
  ];

  if (pretty) {
    formats.push(winston.format.colorize(), winston.format.simple());
  } else {
    formats.push(winston.format.json());
  }

  return winston.createLogger({
    level,
    format: winston.format.combine(...formats),
    defaultMeta: { service: opts.service },
    transports: [new winston.transports.Console()],
  });
}
