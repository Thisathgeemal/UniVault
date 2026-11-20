/**
 * Entry point: loads backend/.env, validates configuration, starts the HTTP
 * server and shuts it down cleanly on Ctrl+C or a stop signal.
 *
 *   npm run dev    – development (restarts on file changes)
 *   npm start      – production (after npm run build)
 */
import 'dotenv/config';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config/env.js';
import { createDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { createLogger } from './lib/logger.js';

function readConfig(): AppConfig {
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n${err.message}\n\nCheck backend/.env against backend/.env.example.\n`);
      process.exit(1);
    }
    throw err;
  }
}

const config = readConfig();
const logger = createLogger(config);
if (config.JWT_SECRET_IS_EPHEMERAL) {
  logger.warn(
    'JWT_SECRET is not set – using a temporary secret; staff will be signed out on every restart',
  );
}

const database = await createDatabase(config.DATABASE_URL);
if (config.DB_AUTO_MIGRATE) {
  const migrations = await runMigrations(database);
  if (migrations.applied.length)
    logger.info({ applied: migrations.applied }, 'Database migrations applied');
}
logger.info(`Database connected (${database.driver})`);

const app = createApp(config, logger, { database });

const server: Server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, corsOrigins: config.CORS_ORIGINS },
    `UniVault backend listening on http://localhost:${config.PORT}/api/v1`,
  );
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.fatal(`Port ${config.PORT} is already in use – stop the other process or change PORT`);
  } else {
    logger.fatal({ err }, 'Server failed to start');
  }
  process.exit(1);
});

function shutdown(signal: string): void {
  logger.info(`${signal} received – shutting down`);
  server.close(() => {
    void database.close().finally(() => {
      logger.info('Server stopped');
      process.exit(0);
    });
  });
  // Force exit if connections do not close in time
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
