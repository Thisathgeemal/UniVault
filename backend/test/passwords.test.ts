import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/passwords.js';

describe('password hashing (scrypt)', () => {
  it('hashes with a random salt and verifies the right password only', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b); // different salts
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
    expect(await verifyPassword('Correct horse battery', a)).toBe(false);
  });

  it('rejects short passwords and malformed hashes', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 10/);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'bcrypt$1$2$3$4$5')).toBe(false);
  });
});
