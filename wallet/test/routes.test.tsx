/**
 * Route names are stable and typed: src/navigation/routes.ts lists every file in app/ (no more,
 * no fewer), and every route in the table renders on the REAL app/ tree at its own path.
 */
import { screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROUTE_FILES, ROUTES } from '../src/navigation/routes';
import { TAB_ROUTES } from '../src/navigation/tabs';

const APP_DIR = join(__dirname, '..', 'app');

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? routeFiles(path) : [relative(APP_DIR, path).split(sep).join('/')];
  });
}

describe('route table', () => {
  it('lists exactly the files in app/', () => {
    expect(routeFiles(APP_DIR).sort()).toEqual(ROUTE_FILES.map((r) => r.file).sort());
  });

  it('has one folder with a Stack per tab', () => {
    for (const tab of TAB_ROUTES) {
      expect(ROUTE_FILES.map((r) => r.file)).toContain(`(tabs)/${tab.name}/_layout.tsx`);
    }
  });

  it('builds detail paths with the id encoded as one segment', () => {
    expect(ROUTES.credential('abc')).toBe('/credentials/abc');
    expect(ROUTES.credential('a/b c')).toBe('/credentials/a%2Fb%20c');
    expect(ROUTES.historyEntry('x?y')).toBe('/history/x%3Fy');
  });
});

describe('every route renders', () => {
  it.each([
    [ROUTES.credentials, 'credentials-screen'],
    [ROUTES.credential('sample-employment-active'), 'credential-detail-screen'],
    [ROUTES.scan, 'scan-screen'],
    [ROUTES.history, 'history-screen'],
    [ROUTES.historyEntry('sample-history-2'), 'history-detail-screen'],
    [ROUTES.settings, 'settings-screen'],
    [ROUTES.language, 'language-screen'],
    [ROUTES.appearance, 'appearance-screen'],
    [ROUTES.security, 'security-screen'],
    [ROUTES.about, 'about-screen'],
    [ROUTES.diagnostics, 'diagnostics-screen'],
    [ROUTES.uiKit, 'ui-kit-screen'],
  ])('%s', async (path, testID) => {
    await renderRouter(APP_DIR, { initialUrl: path });
    expect(await screen.findByTestId(testID)).toBeOnTheScreen();
    expect(screen).toHavePathname(path);
  });

  it('/ redirects to /credentials', async () => {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.home });
    expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.credentials);
  });
});
