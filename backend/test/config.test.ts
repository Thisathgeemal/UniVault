import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/env.js';

describe('environment configuration', () => {
  it('applies safe defaults for local development', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
      CORS_ORIGINS: ['http://localhost:5173', 'http://localhost:5174'],
      AI_SERVICE_URL: 'http://localhost:5001',
      CREDENTIAL_OFFER_TTL_SECONDS: 600,
    });
  });

  it('reads and converts values from the environment', () => {
    const config = loadConfig({
      PORT: '8080',
      CORS_ORIGINS: ' http://a.example , http://b.example ',
      AI_SERVICE_TIMEOUT_MS: '2500',
    });
    expect(config.PORT).toBe(8080);
    expect(config.CORS_ORIGINS).toEqual(['http://a.example', 'http://b.example']);
    expect(config.AI_SERVICE_TIMEOUT_MS).toBe(2500);
  });

  it('treats empty values (as copied from .env.example) as not set', () => {
    const config = loadConfig({ JWT_SECRET: '', DATABASE_URL: '', PORT: '' });
    expect(config.JWT_SECRET_IS_EPHEMERAL).toBe(true); // empty → treated as unset
    expect(config.DATABASE_URL).toBe('pglite://./.data/univault');
    expect(config.PORT).toBe(4000);
  });

  it('rejects invalid values and names every problem variable', () => {
    try {
      loadConfig({ PORT: 'abc', CORS_ORIGINS: 'not-a-url', LOG_LEVEL: 'loud' });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const message = (err as ConfigError).message;
      expect(message).toMatch(/PORT/);
      expect(message).toMatch(/CORS_ORIGINS/);
      expect(message).toMatch(/LOG_LEVEL/);
    }
  });

  it('requires secrets in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
      /JWT_SECRET: is required in production[\s\S]*ISSUER_KEY_PASSPHRASE[\s\S]*DATABASE_URL/,
    );
  });

  it('accepts a complete production configuration', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'x'.repeat(32),
      ISSUER_KEY_PASSPHRASE: 'a-long-passphrase',
      DATABASE_URL: 'postgres://localhost/univault',
    });
    expect(config.NODE_ENV).toBe('production');
  });

  it('uses the embedded development database by default and auto-migrates', () => {
    const config = loadConfig({});
    expect(config.DATABASE_URL).toBe('pglite://./.data/univault');
    expect(config.DB_AUTO_MIGRATE).toBe(true);
    expect(loadConfig({ DB_AUTO_MIGRATE: 'false' }).DB_AUTO_MIGRATE).toBe(false);
  });

  it('accepts pglite and postgres URLs and rejects others', () => {
    expect(loadConfig({ DATABASE_URL: 'pglite://memory' }).DATABASE_URL).toBe('pglite://memory');
    expect(
      loadConfig({ DATABASE_URL: 'postgresql://u:p@db.example:5432/univault' }).DATABASE_URL,
    ).toMatch(/^postgresql/);
    expect(() => loadConfig({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL: must start with/,
    );
  });

  it('refuses the embedded database in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(32),
        ISSUER_KEY_PASSPHRASE: 'a-long-passphrase',
      }),
    ).toThrow(/DATABASE_URL: must be a postgres:\/\/ URL in production/);
  });

  it('generates a temporary JWT secret outside production when none is set', () => {
    const a = loadConfig({});
    const b = loadConfig({});
    expect(a.JWT_SECRET_IS_EPHEMERAL).toBe(true);
    expect(a.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(a.JWT_SECRET).not.toBe(b.JWT_SECRET);
    const fixed = loadConfig({ JWT_SECRET: 'x'.repeat(40) });
    expect(fixed).toMatchObject({ JWT_SECRET: 'x'.repeat(40), JWT_SECRET_IS_EPHEMERAL: false });
  });

  it('applies login protection defaults', () => {
    expect(loadConfig({})).toMatchObject({
      JWT_EXPIRES_IN_SECONDS: 3600,
      LOGIN_MAX_FAILED_ATTEMPTS: 5,
      LOGIN_LOCKOUT_MINUTES: 15,
      LOGIN_RATE_LIMIT_MAX: 20,
    });
    expect(() => loadConfig({ JWT_EXPIRES_IN_SECONDS: '60' })).toThrow(/JWT_EXPIRES_IN_SECONDS/);
  });

  it('never includes secret values in error messages', () => {
    try {
      loadConfig({ JWT_SECRET: 'too-short-secret-value', ISSUER_KEY_PASSPHRASE: 'shortpass' });
      expect.fail('should have thrown');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toMatch(/JWT_SECRET: must be at least 32 characters/);
      expect(message).not.toContain('too-short-secret-value');
      expect(message).not.toContain('shortpass');
    }
  });
});
