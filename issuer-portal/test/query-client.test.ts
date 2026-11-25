import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/api/errors.js';
import { createQueryClient } from '../src/query-client.js';

describe('query client defaults', () => {
  const retry = createQueryClient().getDefaultOptions().queries?.retry as (
    failureCount: number,
    error: unknown,
  ) => boolean;
  const apiError = (status: number) => new ApiError({ status, code: 'X', message: 'x' });

  it('retries network and server errors twice', () => {
    expect(retry(0, apiError(0))).toBe(true);
    expect(retry(1, apiError(503))).toBe(true);
    expect(retry(2, apiError(503))).toBe(false);
    expect(retry(0, new Error('boom'))).toBe(true);
  });

  it('never retries a 4xx (401, 403, 404, 422 do not change by retrying)', () => {
    for (const status of [400, 401, 403, 404, 422, 429])
      expect(retry(0, apiError(status))).toBe(false);
  });

  it('never retries mutations (a login must not be sent twice)', () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
