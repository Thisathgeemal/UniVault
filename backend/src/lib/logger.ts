/**
 * Application logging (pino).
 * - JSON logs in production (one line per event, easy to search).
 * - Readable, coloured logs in development (pino-pretty).
 * - Sensitive values are redacted wherever they appear in a log object.
 */
import { pino, type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import type { AppConfig } from '../config/env.js';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  // Key material and key secrets (Decision 014): never logged, wherever they appear
  'passphrase',
  '*.passphrase',
  'privateKey',
  '*.privateKey',
  'privateKeyPem',
  '*.privateKeyPem',
  'encryptedPrivateKeyPem',
  '*.encryptedPrivateKeyPem',
  'ISSUER_KEY_PASSPHRASE',
  '*.ISSUER_KEY_PASSPHRASE',
  'ISSUER_KEYS_BUNDLE',
  '*.ISSUER_KEYS_BUNDLE',
  'JWT_SECRET',
  '*.JWT_SECRET',
  'bundle',
  '*.bundle',
  // The whole configuration object holds secrets: it is never logged
  'config',
  '*.config',
  '*.secret',
  '*.token',
  '*.pre_authorized_code',
  // Free-text revocation/reissue notes can contain personal data (PDPA)
  'note',
  '*.note',
  'req.body.note',
];

export function createLogger(
  config: Pick<AppConfig, 'NODE_ENV' | 'LOG_LEVEL'>,
  destination?: DestinationStream,
): Logger {
  const options: LoggerOptions = {
    level: config.LOG_LEVEL,
    base: { service: 'univault-backend', env: config.NODE_ENV },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  if (destination) return pino(options, destination);
  if (config.NODE_ENV === 'development') {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss',
          ignore: 'pid,hostname,service,env',
        },
      },
    });
  }
  return pino(options);
}
