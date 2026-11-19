/** Shared validation schemas for route parameters. */
import { z } from 'zod';

export const issuerIdParams = z.object({
  issuerId: z
    .string()
    .regex(/^[a-z0-9-]{3,40}$/, 'must be 3–40 lowercase letters, digits or hyphens'),
});

export const credentialIdParams = z.object({
  credentialId: z.uuid('must be a UUID'),
});

export const verificationIdParams = z.object({
  verificationId: z.uuid('must be a UUID'),
});

export const credentialTypeSchema = z.enum(['EmploymentCredential', 'KYCCredential']);
