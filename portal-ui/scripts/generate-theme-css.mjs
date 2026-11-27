// Writes portal-ui/theme.css from the built tokens (run by `npm run build`, after tsc).
// theme.css is generated: change src/tokens.ts, never the CSS file.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderThemeCss } from '../dist/theme-css.js';

const target = fileURLToPath(new URL('../theme.css', import.meta.url));
const css = renderThemeCss();
let current = '';
try {
  current = readFileSync(target, 'utf8');
} catch {
  // first generation
}
if (current === css) {
  console.log('theme.css is up to date with src/tokens.ts');
} else {
  writeFileSync(target, css);
  console.log('theme.css regenerated from src/tokens.ts');
}
