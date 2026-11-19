import { Writable } from 'node:stream';
import { pino, type Logger } from 'pino';
import { createApp } from '../src/app.js';
import { loadConfig, type AppConfig } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    CORS_ORIGINS: 'http://localhost:5173,http://localhost:5174',
    ...overrides,
  });
}

/** A logger that collects JSON log lines in memory, for assertions. */
export function captureLogger(config: AppConfig = testConfig({ LOG_LEVEL: 'info' })): {
  logger: Logger;
  lines: () => Record<string, unknown>[];
} {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  const logger = createLogger(config, stream);
  return {
    logger,
    lines: () =>
      chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

export function testApp(overrides: Record<string, string> = {}) {
  const config = testConfig(overrides);
  return createApp(config, pino({ level: 'silent' }));
}
