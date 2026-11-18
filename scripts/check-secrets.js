#!/usr/bin/env node
// Fails (exit 1) if any secret-looking file is tracked or staged in Git:
//   - .env / .env.* files (except .env.example and .env.*.example templates)
//   - *.pem and *.key files
// Cross-platform: uses only Node built-ins and the git CLI (no shell syntax).
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ALLOWED_ENV_TEMPLATE = /^\.env(\..+)?\.example$/i;
const ENV_FILE = /^\.env(\..+)?$/i;
const KEY_EXT = new Set(['.pem', '.key']);

function isSecretFile(file) {
  const base = path.posix.basename(file);
  if (ENV_FILE.test(base)) return !ALLOWED_ENV_TEMPLATE.test(base);
  return KEY_EXT.has(path.posix.extname(base).toLowerCase());
}

let output;
try {
  // -z: NUL-separated, so paths with spaces or non-ASCII characters are not quoted/escaped.
  output = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
} catch (err) {
  console.error('check:secrets: failed to run "git ls-files". Is this a Git repository?');
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
}

const offenders = output.split('\0').filter(Boolean).filter(isSecretFile);

if (offenders.length > 0) {
  console.error('check:secrets: FAILED. These files are tracked by Git and look like secrets:\n');
  for (const file of offenders) console.error(`  - ${file}`);
  console.error(
    '\nRemove them from the index with "git rm --cached <file>", make sure .gitignore covers them,' +
      '\nand rotate any secret that was ever committed.',
  );
  process.exit(1);
}

console.log('check:secrets: OK, no .env, .pem or .key files are tracked.');
