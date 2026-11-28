/**
 * Status colours mean ONLY a credential's or a verification's status (design-system.md, "Status
 * colours" and Do / Don't "Success confirmations"). A confirmation that something worked ("PIN
 * set", "Saved") is not a status: accent / brand-soft / text-muted. This test scans the wallet's
 * source (comments stripped) for status colour tokens (`statusValid…`, `onStatusRevoked`, …), the
 * status token tables and status `tone` values, and fails when a file uses a status set that the
 * allow-list below does not give it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

type StatusSet = 'valid' | 'expired' | 'revoked' | 'pending';
const ALL: readonly StatusSet[] = ['valid', 'expired', 'revoked', 'pending'];

/** File → the status sets it may use, and why. */
const ALLOWED: Record<string, { sets: readonly StatusSet[]; why: string }> = {
  'src/components/StatusBadge.tsx': { sets: ALL, why: 'a credential status' },
  'src/components/Badge.tsx': { sets: ALL, why: "StatusBadge's pill (status sets + neutral)" },
  'src/components/StateIcon.tsx': { sets: ['revoked'], why: 'the error state icon' },
  'src/components/AppText.tsx': { sets: ['revoked'], why: 'tone="error": error messages' },
  'src/theme/index.ts': { sets: ALL, why: 'toneColors (badges); the destructive button' },
  'src/theme/contrast.ts': { sets: ALL, why: 'checks the status pairs' },
  'app/(tabs)/settings/diagnostics.tsx': {
    sets: ['valid', 'revoked'],
    why: 'dev-only pass / fail',
  },
  'app/(tabs)/settings/ui-kit.tsx': { sets: ALL, why: 'dev-only catalogue of the statuses' },
};

const ROOT = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'fixtures' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [relative(ROOT, path).replace(/\\/g, '/')] : [];
  });
}

const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** The status sets a piece of code uses. */
export function statusSetsUsed(code: string): StatusSet[] {
  const src = stripComments(code);
  const found = new Set<StatusSet>();
  for (const m of src.matchAll(/\b(?:on)?[sS]tatus(Valid|Expired|Revoked|Pending)\w*/g)) {
    found.add(m[1]!.toLowerCase() as StatusSet);
  }
  // the whole status table, or the badge colour function: every set
  if (/\b(statusTokens|STATUS_SETS|toneColors)\b/.test(src)) ALL.forEach((s) => found.add(s));
  // tone="valid" / tone: 'revoked' / tone={pass ? 'valid' : 'revoked'}
  for (const m of src.matchAll(/\btone\s*[=:]\s*\{?([^}\n]*)/g)) {
    for (const w of m[1]!.matchAll(/['"](valid|expired|revoked|pending)['"]/g)) {
      found.add(w[1] as StatusSet);
    }
  }
  return [...found].sort();
}

describe('status colours only for status', () => {
  const files = [...sourceFiles(join(ROOT, 'src')), ...sourceFiles(join(ROOT, 'app'))];

  it('finds the source files and recognises every way of using a status colour', () => {
    expect(files.length).toBeGreaterThan(60);
    expect(statusSetsUsed('color={theme.colors.statusValid}')).toEqual(['valid']);
    expect(statusSetsUsed('bg: colors.statusExpiredBg, fg: c.onStatusRevoked')).toEqual([
      'expired',
      'revoked',
    ]);
    expect(statusSetsUsed(`<Badge tone={ok ? 'valid' : 'revoked'} />`)).toEqual([
      'revoked',
      'valid',
    ]);
    expect(statusSetsUsed("toast.show({ tone: 'pending' })")).toEqual(['pending']);
    expect(statusSetsUsed('const x = statusTokens[set];')).toEqual([...ALL].sort());
    // comments and words are not uses
    expect(statusSetsUsed('// statusValid in a comment\n/* statusRevokedBg */ "Valid"')).toEqual(
      [],
    );
    expect(statusSetsUsed("tone: 'success' // a toast")).toEqual([]);
  });

  it.each(Object.entries(ALLOWED))('the allow-list names a real file: %s', (file) => {
    expect(files).toContain(file);
  });

  it('no component uses a status colour outside the allow-list', () => {
    const offenders = files.flatMap((file) => {
      const used = statusSetsUsed(readFileSync(join(ROOT, file), 'utf8'));
      const allowed = ALLOWED[file]?.sets ?? [];
      const extra = used.filter((set) => !allowed.includes(set));
      return extra.length ? [`${file}: ${extra.join(', ')}`] : [];
    });
    expect(offenders).toEqual([]);
  });

  it('the success state (PIN set, fingerprint on) uses no status colour', () => {
    const code = readFileSync(join(ROOT, 'src/components/SuccessState.tsx'), 'utf8');
    expect(statusSetsUsed(code)).toEqual([]);
    expect(code).toMatch(/colors\.accent\b/);
    expect(code).toMatch(/colors\.brandSoft\b/);
  });
});
