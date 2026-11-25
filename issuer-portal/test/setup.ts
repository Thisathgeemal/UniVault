import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { i18n, setupI18n } from '../src/i18n/index.js';
import { resetMockBackend, server } from './mock-backend.js';

setupI18n('en');

// Any request without a handler fails the test: nothing may reach a real server
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(async () => {
  cleanup();
  server.resetHandlers();
  resetMockBackend();
  window.sessionStorage.clear();
  window.localStorage.clear();
  await i18n.changeLanguage('en');
});
afterAll(() => server.close());
