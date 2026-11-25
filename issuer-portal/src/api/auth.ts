/** Staff authentication endpoints (backend /api/v1/auth, Decision 009). */
import { z } from 'zod';
import type { ApiClient } from './client.js';

export const ROLES = ['admin', 'officer'] as const;
export type Role = (typeof ROLES)[number];

export const staffSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(ROLES),
  issuer: z.object({ id: z.string(), name: z.string(), type: z.enum(['employer', 'bank']) }),
});
export type Staff = z.infer<typeof staffSchema>;

const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number(),
  staff: staffSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * Same rules as the backend's loginBody (backend/src/routes/auth.routes.ts): the email is
 * trimmed (pasted spaces are tolerated) and must be a valid address of at most 254 characters;
 * the password has 1–200 characters. Messages are i18n keys under login.fieldErrors.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'emailRequired')
    .pipe(z.email('emailInvalid').max(254, 'emailInvalid')),
  password: z.string().min(1, 'passwordRequired').max(200, 'passwordTooLong'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export async function login(api: ApiClient, input: LoginInput): Promise<LoginResponse> {
  const body = await api.request<unknown>('/auth/login', {
    method: 'POST',
    body: input,
    auth: false,
  });
  return loginResponseSchema.parse(body);
}

export async function fetchMe(api: ApiClient): Promise<Staff> {
  const body = await api.request<unknown>('/auth/me');
  return z.object({ staff: staffSchema }).parse(body).staff;
}

/** Tells the backend (it logs the logout). The token itself is discarded by the portal. */
export async function logout(api: ApiClient): Promise<void> {
  await api.request<void>('/auth/logout', { method: 'POST', ignoreSessionEnd: true });
}
