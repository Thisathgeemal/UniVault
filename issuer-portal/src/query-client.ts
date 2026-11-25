import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api/errors.js';

/** Retry network and 5xx failures twice; never retry 4xx (they won't change by retrying). */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          failureCount < 2 &&
          !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
      mutations: { retry: false },
    },
  });
}
