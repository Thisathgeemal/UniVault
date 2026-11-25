/** Production Content-Security-Policy (csp.ts, injected by vite.config.ts at build time). */
import { describe, expect, it } from 'vitest';
import { apiOrigin, contentSecurityPolicy } from '../csp.js';

const directives = (policy: string) =>
  Object.fromEntries(
    policy.split('; ').map((d) => {
      const [name, ...values] = d.split(' ');
      return [name, values.join(' ')];
    }),
  );

describe('content security policy', () => {
  it("allows only 'self' for scripts and styles, and the API origin for connections", () => {
    const csp = directives(contentSecurityPolicy('https://api.univault.example/api/v1'));
    expect(csp['default-src']).toBe("'self'");
    expect(csp['script-src']).toBe("'self'"); // no inline scripts, no eval
    expect(csp['style-src']).toBe("'self'");
    expect(csp['font-src']).toBe("'self'"); // fonts are self-hosted
    expect(csp['connect-src']).toBe("'self' https://api.univault.example");
    expect(csp['object-src']).toBe("'none'");
    expect(Object.values(csp).join(' ')).not.toMatch(/unsafe-inline|unsafe-eval/);
  });

  it("uses 'self' only for a relative or invalid API URL", () => {
    expect(apiOrigin('/api/v1')).toBeNull();
    expect(apiOrigin('ftp://files.example')).toBeNull();
    expect(directives(contentSecurityPolicy('/api/v1'))['connect-src']).toBe("'self'");
    expect(apiOrigin('http://localhost:4000/api/v1')).toBe('http://localhost:4000');
  });
});
