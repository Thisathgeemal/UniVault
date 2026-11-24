#!/usr/bin/env node
// Fails (exit 1) if anything secret-looking is tracked or staged in Git (the index):
//   by name:    .env / .env.* files (except .env.example and .env.*.example templates),
//               *.pem, *.key, and issuer key bundles (*.bundle.b64)
//   by content: a PEM private key (BEGIN [RSA |EC |DSA |OPENSSH |ENCRYPTED ]PRIVATE KEY followed
//               by key data), or a base64-encoded PEM header ("LS0tLS1CRUdJTi..." = "-----BEGIN")
// Content is read from the index (what would be committed), so a staged key is caught even if
// the working-tree file was changed or deleted afterwards. Only file names and the reason are
// printed – never the matching content.
// Cross-platform: uses only Node built-ins and the git CLI (no shell syntax). Run it from the
// repository to check (the current directory decides which repository).
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ALLOWED_ENV_TEMPLATE = /^\.env(\..+)?\.example$/i;
const ENV_FILE = /^\.env(\..+)?$/i;
const KEY_EXT = new Set(['.pem', '.key']);
const BUNDLE_FILE = /\.bundle\.b64$/i;
const MAX_SCAN_BYTES = 2 * 1024 * 1024;

// Built from parts so this file never matches itself
const DASHES = '-'.repeat(5);
const PEM_PRIVATE_KEY = new RegExp(
  `${DASHES}BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY${DASHES}\\s*[\\r\\n]+\\s*[A-Za-z0-9+/=]{16,}`,
);
// "LS0tLS1CRUdJTi" is base64 for "-----BEGIN"; a real encoded PEM continues for a long time
const BASE64_PEM = new RegExp(`${'LS0tLS1CRUdJ'}Ti[A-Za-z0-9+/]{40,}`);

function nameReason(file) {
  const base = path.posix.basename(file);
  if (ENV_FILE.test(base)) return ALLOWED_ENV_TEMPLATE.test(base) ? null : 'environment file';
  if (BUNDLE_FILE.test(base)) return 'issuer key bundle';
  if (KEY_EXT.has(path.posix.extname(base).toLowerCase())) return 'key or certificate file';
  return null;
}

function contentReason(buffer) {
  if (buffer.length > MAX_SCAN_BYTES) return null;
  const text = buffer.toString('latin1');
  if (PEM_PRIVATE_KEY.test(text)) return 'contains a PEM private key';
  if (BASE64_PEM.test(text)) return 'contains a base64-encoded PEM block';
  return null;
}

function git(args, input) {
  return execFileSync('git', args, { input, maxBuffer: 512 * 1024 * 1024 });
}

let entries;
try {
  // -s: mode, blob id and stage per index entry; -z: NUL-separated, so paths are not quoted
  entries = git(['ls-files', '-s', '-z'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [meta, file] = line.split('\t');
      const [mode, blob] = meta.split(' ');
      return { mode, blob, file };
    });
} catch (err) {
  console.error('check:secrets: failed to run "git ls-files". Is this a Git repository?');
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
}

const offenders = [];
for (const entry of entries) {
  const reason = nameReason(entry.file);
  if (reason) offenders.push({ file: entry.file, reason });
}

// Read every staged blob in ONE git process (submodules have no blob to read)
const blobs = entries.filter((e) => e.mode !== '160000');
if (blobs.length > 0) {
  const output = git(['cat-file', '--batch'], `${blobs.map((e) => e.blob).join('\n')}\n`);
  let offset = 0;
  for (const entry of blobs) {
    const headerEnd = output.indexOf(0x0a, offset);
    const header = output.subarray(offset, headerEnd).toString('utf8').split(' ');
    const size = Number(header[2]);
    const content = output.subarray(headerEnd + 1, headerEnd + 1 + size);
    offset = headerEnd + 1 + size + 1; // content, then a newline
    const reason = Number.isFinite(size) ? contentReason(content) : null;
    if (reason && !offenders.some((o) => o.file === entry.file)) {
      offenders.push({ file: entry.file, reason });
    }
  }
}

if (offenders.length > 0) {
  console.error('check:secrets: FAILED. These tracked or staged files look like secrets:\n');
  for (const { file, reason } of offenders) console.error(`  - ${file} (${reason})`);
  console.error(
    '\nRemove them from the index with "git rm --cached <file>", make sure .gitignore covers them,' +
      '\nand rotate any secret that was ever committed.',
  );
  process.exit(1);
}

console.log(
  'check:secrets: OK, no .env, .pem, .key or key-bundle files and no private keys are tracked or staged.',
);
