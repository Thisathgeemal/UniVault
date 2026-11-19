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
const app = createApp(config, logger);

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
    logger.info('Server stopped');
    process.exit(0);
  });
  // Force exit if connections do not close in time
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
