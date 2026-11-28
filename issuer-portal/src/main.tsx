// Self-hosted fonts (the CSP allows font-src 'self' only): Noto Sans (Latin 400/500/600) and
// Noto Sans Sinhala (400/600) per the design system, JetBrains Mono for ids and JWT snippets
import '@fontsource/noto-sans/latin-400.css';
import '@fontsource/noto-sans/latin-500.css';
import '@fontsource/noto-sans/latin-600.css';
import '@fontsource/noto-sans-sinhala/sinhala-400.css';
import '@fontsource/noto-sans-sinhala/sinhala-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './index.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary, ErrorFallback } from '@univault/portal-ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { i18n, setupI18n } from './i18n/index.js';
import { createQueryClient } from './query-client.js';
import { createRoutes } from './router.js';

setupI18n();
const queryClient = createQueryClient();
const router = createBrowserRouter(createRoutes());

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary
      fallback={() => (
        <ErrorFallback
          title={i18n.t('errors.pageCrashed.title')}
          message={i18n.t('errors.pageCrashed.message')}
          retryLabel={i18n.t('errors.pageCrashed.reload')}
          onRetry={() => window.location.reload()}
        />
      )}
    >
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
