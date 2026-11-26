import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ConfigError, DEV_EXAMPLE_KEY_PASSPHRASE, loadConfig } from '../src/config/env.js';

const PRODUCTION = {
  NODE_ENV: 'production',
  JWT_SECRET: 'x'.repeat(32),
  ISSUER_KEY_PASSPHRASE: 'a-long-production-passphrase',
  DATABASE_URL: 'postgres://localhost/univault',
  PUBLIC_BASE_URL: 'https://issuer.univault.example',
};

describe('environment configuration', () => {
  it('applies safe defaults for local development', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
      CORS_ORIGINS: ['http://localhost:5173', 'http://localhost:5174'],
      AI_SERVICE_URL: 'http://localhost:5001',
      CREDENTIAL_OFFER_TTL_SECONDS: 300, // 5 minutes (Decisions 011, 021)
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
    const config = loadConfig(PRODUCTION);
    expect(config.NODE_ENV).toBe('production');
    expect(config.ISSUER_KEY_SOURCE).toBe('file');
    expect(config.ISSUER_KEYS_STRICT_STARTUP).toBe(true); // always strict in production
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

  it('requires an https PUBLIC_BASE_URL in production (the OpenID4VCI credential_issuer)', () => {
    expect(() =>
      loadConfig({ ...PRODUCTION, PUBLIC_BASE_URL: 'http://issuer.univault.example' }),
    ).toThrow(/PUBLIC_BASE_URL: must be an https:\/\/ URL in production/);
    const { PUBLIC_BASE_URL: _unused, ...withoutBaseUrl } = PRODUCTION;
    expect(() => loadConfig(withoutBaseUrl)).toThrow(/PUBLIC_BASE_URL: must be an https/); // the http default
    expect(
      loadConfig({
        ...PRODUCTION,
        NODE_ENV: 'development',
        PUBLIC_BASE_URL: 'http://192.168.1.20:4000',
      }).PUBLIC_BASE_URL,
    ).toBe('http://192.168.1.20:4000');
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

  describe('issuer key settings (Decision 014)', () => {
    it('defaults to file keys and a non-strict start-up outside production', () => {
      expect(loadConfig({})).toMatchObject({
        ISSUER_KEY_SOURCE: 'file',
        ISSUER_KEYS_STRICT_STARTUP: false,
      });
      expect(loadConfig({ ISSUER_KEYS_STRICT_STARTUP: 'true' }).ISSUER_KEYS_STRICT_STARTUP).toBe(
        true,
      );
      expect(() => loadConfig({ ISSUER_KEY_SOURCE: 'vault' })).toThrow(/ISSUER_KEY_SOURCE/);
    });

    it('KEY_RETRY_BACKOFF_SECONDS defaults to 30 and accepts 0 to 3600 whole seconds', () => {
      expect(loadConfig({}).KEY_RETRY_BACKOFF_SECONDS).toBe(30);
      expect(loadConfig({ KEY_RETRY_BACKOFF_SECONDS: '0' }).KEY_RETRY_BACKOFF_SECONDS).toBe(0);
      expect(loadConfig({ KEY_RETRY_BACKOFF_SECONDS: '' }).KEY_RETRY_BACKOFF_SECONDS).toBe(30);
      for (const bad of ['-1', '3601', '1.5', 'soon']) {
        expect(() => loadConfig({ KEY_RETRY_BACKOFF_SECONDS: bad })).toThrow(
          /KEY_RETRY_BACKOFF_SECONDS/,
        );
      }
    });

    it('requires a production passphrase of at least 20 characters', () => {
      expect(() =>
        loadConfig({ ...PRODUCTION, ISSUER_KEY_PASSPHRASE: 'nineteen-characters' }),
      ).toThrow(/ISSUER_KEY_PASSPHRASE: must be at least 20 characters in production/);
    });

    it('refuses the development passphrase from .env.example in production', () => {
      expect(() =>
        loadConfig({ ...PRODUCTION, ISSUER_KEY_PASSPHRASE: DEV_EXAMPLE_KEY_PASSPHRASE }),
      ).toThrow(/ISSUER_KEY_PASSPHRASE: must not be the development value/);
      // The development value is still fine outside production
      expect(loadConfig({ ISSUER_KEY_PASSPHRASE: DEV_EXAMPLE_KEY_PASSPHRASE })).toBeTruthy();
    });

    it('keeps the refused value in sync with backend/.env.example', () => {
      const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
      const line = example.split(/\r?\n/).find((l) => l.startsWith('ISSUER_KEY_PASSPHRASE='));
      expect(line).toBe(`ISSUER_KEY_PASSPHRASE=${DEV_EXAMPLE_KEY_PASSPHRASE}`);
      // The bundle and source are documented without values
      expect(example).toMatch(/^ISSUER_KEYS_BUNDLE=$/m);
      expect(example).toMatch(/^ISSUER_KEY_SOURCE=file$/m);
    });

    it('requires ISSUER_KEYS_BUNDLE in production env mode', () => {
      expect(() => loadConfig({ ...PRODUCTION, ISSUER_KEY_SOURCE: 'env' })).toThrow(
        /ISSUER_KEYS_BUNDLE: is required in production when ISSUER_KEY_SOURCE=env/,
      );
      expect(
        loadConfig({ ...PRODUCTION, ISSUER_KEY_SOURCE: 'env', ISSUER_KEYS_BUNDLE: 'e30=' })
          .ISSUER_KEY_SOURCE,
      ).toBe('env');
    });

    it('refuses a non-strict key check in production', () => {
      expect(() => loadConfig({ ...PRODUCTION, ISSUER_KEYS_STRICT_STARTUP: 'false' })).toThrow(
        /ISSUER_KEYS_STRICT_STARTUP: cannot be false in production/,
      );
    });

    it('never puts the passphrase or bundle in error messages', () => {
      try {
        loadConfig({
          ...PRODUCTION,
          ISSUER_KEY_PASSPHRASE: 'short-secret-phrase',
          ISSUER_KEY_SOURCE: 'env',
          ISSUER_KEYS_STRICT_STARTUP: 'false',
        });
        expect.fail('should have thrown');
      } catch (err) {
        expect((err as Error).message).not.toContain('short-secret-phrase');
      }
    });
  });
});
