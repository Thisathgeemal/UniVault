/**
 * scripts/check-secrets.js (Decision 014): fails on tracked or STAGED secrets, by file name
 * (.env, *.pem, *.key, *.bundle.b64) and by content (PEM private keys, base64-encoded PEM).
 * Keys are generated at runtime and planted in a throwaway Git repository; the real repository
 * must pass. The script must never print the secret it found.
 *
 * Heavy test (Vitest project "heavy"): it runs git and node processes, so it runs after the fast
 * tests, one file at a time (Sprint 1, Issue 15). The calls are synchronous, so Vitest's timeout
 * cannot interrupt them: each process gets its own `timeout` and is killed when it is reached.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const script = join(repoRoot, 'scripts', 'check-secrets.js');
let dir: string;

/** One git or scan process takes well under a second alone; killed after this. */
const PROCESS_TIMEOUT_MS = 20_000;
/** A test runs up to three processes. */
const SCAN_TEST_TIMEOUT_MS = 60_000;

const git = (...args: string[]) =>
  execFileSync('git', args, { cwd: dir, stdio: 'pipe', timeout: PROCESS_TIMEOUT_MS });
const scan = (cwd = dir) => {
  const result = spawnSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    timeout: PROCESS_TIMEOUT_MS,
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
};
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PLAIN_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const ENCRYPTED_PEM = privateKey.export({
  type: 'pkcs8',
  format: 'pem',
  cipher: 'aes-256-cbc',
  passphrase: 'throwaway-test-passphrase',
}) as string;
const keyBody = (pem: string) => pem.split('\n')[1]!;

/** Plants one file in a fresh index, runs the scan, then removes it from the index again. */
async function scanWith(name: string, content: string) {
  await writeFile(join(dir, name), content);
  git('add', '--force', name);
  try {
    return scan();
  } finally {
    git('rm', '--cached', '--force', '--quiet', name);
    await rm(join(dir, name), { force: true });
  }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'univault-secrets-'));
  git('init', '--quiet');
  await writeFile(join(dir, 'README.md'), '# Throwaway repository for check:secrets tests\n');
  // Mentions of headers without key data are not secrets (e.g. code constants, docs)
  await writeFile(
    join(dir, 'constants.ts'),
    "export const HEADER = '-----BEGIN ENCRYPTED PRIVATE KEY-----';\n// LS0tLS1CRUdJTi is base64 for -----BEGIN\n",
  );
  git('add', 'README.md', 'constants.ts');
}, SCAN_TEST_TIMEOUT_MS);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('check:secrets', () => {
  it(
    'passes a clean repository (header constants are not secrets)',
    () => {
      const result = scan();
      expect(result.code).toBe(0);
      expect(result.output).toContain('check:secrets: OK');
    },
    SCAN_TEST_TIMEOUT_MS,
  );

  it.each([
    ['an unencrypted PEM private key', 'notes.txt', () => PLAIN_PEM, 'contains a PEM private key'],
    [
      'an encrypted PEM private key',
      'config.json',
      () => JSON.stringify({ key: ENCRYPTED_PEM }, null, 2).replace(/\\n/g, '\n'),
      'contains a PEM private key',
    ],
    [
      'a base64-encoded PEM key',
      'data.txt',
      () => Buffer.from(ENCRYPTED_PEM).toString('base64'),
      'contains a base64-encoded PEM block',
    ],
    ['a key bundle file', 'issuer-keys.bundle.b64', () => 'e30=', 'issuer key bundle'],
    ['a .pem file', 'throwaway.pem', () => 'not really a key', 'key or certificate file'],
    ['a .env file', '.env', () => 'JWT_SECRET=x', 'environment file'],
  ])(
    'fails on %s and names the file, never the secret',
    async (_label, name, content, reason) => {
      const text = content();
      const result = await scanWith(name, text);
      expect(result.code).toBe(1);
      expect(result.output).toContain(`${name} (${reason})`);
      expect(result.output).not.toContain('PRIVATE KEY-----\n');
      expect(result.output).not.toContain(keyBody(PLAIN_PEM));
      expect(result.output).not.toContain(keyBody(ENCRYPTED_PEM));
      if (text.length > 60) expect(result.output).not.toContain(text.slice(20, 60));
    },
    SCAN_TEST_TIMEOUT_MS,
  );

  it(
    'catches a key that is staged even after the working-tree file was deleted',
    async () => {
      await writeFile(join(dir, 'staged.txt'), PLAIN_PEM);
      git('add', 'staged.txt');
      await rm(join(dir, 'staged.txt'));
      try {
        const result = scan();
        expect(result.code).toBe(1);
        expect(result.output).toContain('staged.txt (contains a PEM private key)');
      } finally {
        git('rm', '--cached', '--force', '--quiet', 'staged.txt');
      }
    },
    SCAN_TEST_TIMEOUT_MS,
  );

  it(
    'exits 2 outside a Git repository',
    async () => {
      const plain = await mkdtemp(join(tmpdir(), 'univault-nogit-'));
      try {
        expect(scan(plain).code).toBe(2);
      } finally {
        await rm(plain, { recursive: true, force: true });
      }
    },
    SCAN_TEST_TIMEOUT_MS,
  );

  it(
    'passes the real UniVault repository (no key fixtures are committed)',
    () => {
      const result = scan(repoRoot);
      expect(result.output).toContain('check:secrets: OK');
      expect(result.code).toBe(0);
    },
    SCAN_TEST_TIMEOUT_MS,
  );
});
