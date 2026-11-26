/**
 * Starts the REAL backend for the Playwright e2e test on a THROWAWAY embedded database
 * (same approach as scripts/evidence/s1-keys.ps1):
 *
 * - its own temp folder under the OS temp dir (never backend/.data, backend/keys or .env:
 *   DOTENV_CONFIG_PATH points at a file that does not exist);
 * - migrated and seeded with the synthetic demo data and a random staff password that the
 *   Playwright config generated (UNIVAULT_E2E_PASSWORD, never printed);
 * - a random JWT_SECRET; CORS allows only the e2e portal origin;
 * - CREDENTIAL_OFFER_TTL_SECONDS=15 (the offer spec watches a QR code expire);
 * - signing keys (keys:init) encrypted with a random passphrase, and the dashboard demo data
 *   (db:seed:demo: credentials of every status for Serendib Trading), so the dashboard shows
 *   real numbers;
 * - one holder record changed after its credential was signed (db:holder:set STC-00003), so
 *   the reissue e2e test sees a difference.
 *
 * Playwright starts this as a webServer and stops it after the run. Folders left behind by an
 * interrupted run are removed at the next start.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIX = 'univault-e2e-';
const backendDir = fileURLToPath(new URL('../../backend/', import.meta.url));
const port = process.env.E2E_BACKEND_PORT ?? '4100';
const portalOrigin = process.env.E2E_PORTAL_ORIGIN ?? 'http://localhost:5180';
const password = process.env.UNIVAULT_E2E_PASSWORD;
if (!password) {
  console.error('UNIVAULT_E2E_PASSWORD is not set (playwright.config.ts sets it).');
  process.exit(1);
}

for (const name of readdirSync(tmpdir())) {
  if (name.startsWith(PREFIX)) {
    try {
      rmSync(join(tmpdir(), name), { recursive: true, force: true });
    } catch {
      // still in use by another run: leave it
    }
  }
}
const workDir = mkdtempSync(join(tmpdir(), PREFIX));

/** A clean environment: nothing from the developer's shell or backend/.env leaks in. */
const pass = (names) =>
  Object.fromEntries(names.filter((n) => process.env[n]).map((n) => [n, process.env[n]]));
const env = {
  ...pass([
    'PATH',
    'Path',
    'SystemRoot',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'HOME',
  ]),
  DOTENV_CONFIG_PATH: join(workDir, 'does-not-exist.env'),
  NODE_ENV: 'development',
  LOG_LEVEL: 'warn',
  PORT: port,
  // credential_issuer in every offer: this backend, not the default :4000
  PUBLIC_BASE_URL: `http://localhost:${port}`,
  DATABASE_URL: `pglite://${join(workDir, 'db').replace(/\\/g, '/')}`,
  ISSUER_KEYS_DIR: join(workDir, 'keys'),
  JWT_SECRET: randomBytes(32).toString('hex'),
  ISSUER_KEY_PASSPHRASE: randomBytes(24).toString('hex'),
  CORS_ORIGINS: portalOrigin,
  SEED_STAFF_PASSWORD: password,
  LOGIN_RATE_LIMIT_MAX: '100',
  // Short offer lifetime, so e2e/offer.spec.ts can watch the QR code expire
  CREDENTIAL_OFFER_TTL_SECONDS: '15',
};

const node = (args, options) =>
  spawnSync(process.execPath, ['--import', 'tsx', ...args], { cwd: backendDir, env, ...options });

// crypto-core and claims-validation must be built for the backend to start
// (a fixed command string: npm is a .cmd script on Windows, so it needs a shell)
const build = spawnSync(
  'npm --prefix ../crypto-core run build && npm --prefix ../claims-validation run build',
  {
    cwd: backendDir,
    stdio: 'inherit',
    shell: true,
  },
);
if (build.status !== 0) process.exit(build.status ?? 1);

// Migrate and seed (prints counts and the demo logins table, never the custom password)
const seed = node(['src/db/cli.ts', 'seed'], { stdio: 'inherit' });
if (seed.status !== 0) process.exit(seed.status ?? 1);

// Signing keys, then the dashboard demo data (prints key ids and counts per status only)
for (const command of ['keys', 'seed-demo']) {
  const step = node(['src/db/cli.ts', command], { stdio: 'inherit' });
  if (step.status !== 0) process.exit(step.status ?? 1);
}

// e2e/credentials.spec.ts: STC-00003 holds an active demo credential; changing the holder
// record now (dev-only db:holder:set, before the server opens the database) gives the reissue
// preview a real difference. Prints the claim name only.
const change = node(
  ['src/db/cli.ts', 'holder-set', 'STC-00003', 'designation', 'Senior HR Executive'],
  { stdio: 'inherit' },
);
if (change.status !== 0) process.exit(change.status ?? 1);

const server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
  cwd: backendDir,
  env,
  stdio: 'inherit',
});

const cleanUp = () => {
  if (server.exitCode === null) server.kill();
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // removed at the next start
  }
};
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanUp();
    process.exit(0);
  });
}
server.on('exit', (code) => {
  cleanUp();
  process.exit(code ?? 0);
});
