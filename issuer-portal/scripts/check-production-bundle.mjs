/**
 * Runs after `vite build` (npm run build): checks the production bundle in dist/assets.
 *   - The offer screen's developer panel, which would show the one-time pre-authorised code,
 *     is not in the bundle at all (Decision 021): the page tests import.meta.env.PROD inline,
 *     so the build removes it. Its translation keys are the marker.
 *   - No eval / new Function (the production CSP forbids them).
 * Exits 1 with the reason if a check fails.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = fileURLToPath(new URL('../dist/assets/', import.meta.url));
const bundle = readdirSync(assets)
  .filter((file) => file.endsWith('.js'))
  .map((file) => readFileSync(join(assets, file), 'utf8'))
  .join('\n');

const problems = [];
if (!bundle.includes('offer.qrAlt')) problems.push('the offer screen is missing from the bundle');
for (const marker of ['offer.dev.summary', 'offer.dev.warning']) {
  if (bundle.includes(marker)) problems.push(`developer panel found in the bundle (${marker})`);
}
if (/\bnew Function\s*\(/.test(bundle)) problems.push('new Function( found in the bundle');
if (/\beval\s*\(/.test(bundle)) problems.push('eval( found in the bundle');

if (problems.length > 0) {
  console.error(`Production bundle check failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('Production bundle check: no developer panel, no eval / new Function.');
