import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import type { Database } from '../src/db/client.js';
import { seedDatabase } from '../src/db/seed.js';
import { freshDatabase } from './db/helpers.js';
import { testConfig } from './helpers.js';

export const PASSWORD = 'test-password-123';
const FIXTURES = fileURLToPath(new URL('./fixtures/seed-data/', import.meta.url));

export const STAFF = {
  employerAdmin: 'admin@serendib-trading.example',
  employerOfficer: 'officer@serendib-trading.example',
  bankAdmin: 'admin@bank-a.example',
  bankOfficer: 'officer@bank-a.example',
} as const;

export interface AuthedTestApp {
  app: Express;
  database: Database;
  login: (email: string, password?: string) => Promise<request.Response>;
  tokenFor: (email: string) => Promise<string>;
}

/** App with a fresh seeded database (3 issuers, 6 staff) and login helpers. */
export async function authedTestApp(
  overrides: Record<string, string> = {},
  logger: Logger = pino({ level: 'silent' }),
): Promise<AuthedTestApp> {
  const database = await freshDatabase();
  await seedDatabase(database.db, { dataDir: FIXTURES, staffPassword: PASSWORD });
  const app = createApp(
    testConfig({
      JWT_SECRET: 'test-jwt-secret-that-is-long-enough-123456',
      LOGIN_RATE_LIMIT_MAX: '1000', // tests log in many times; the rate-limit test overrides this
      ...overrides,
    }),
    logger,
    { database },
  );
  const login = (email: string, password = PASSWORD) =>
    request(app).post('/api/v1/auth/login').send({ email, password });
  const tokenFor = async (email: string) => {
    const res = await login(email);
    if (res.status !== 200)
      throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
    return res.body.accessToken as string;
  };
  return { app, database, login, tokenFor };
}
