/** Showing holder data: masked ID numbers, option labels. (Status: credentials/status.ts.) */
import type { TFunction } from 'i18next';
import { tKey } from './validation.js';

/**
 * Masking rule: lists show only the last 4 characters of an ID number (the backend sends no
 * more than that); the full number appears on the holder's detail page only.
 */
export const maskIdNumber = (last4: string) => `•••• ${last4}`;

/** The label of a schema option (enum value), e.g. employment_type "permanent". */
export function optionLabel(
  t: TFunction,
  path: string,
  value: string,
  exists: (key: string) => boolean,
): string {
  const field = path.split('.').pop()!;
  const key = `holders.options.${field}.${value}`;
  return exists(key) ? tKey(t, key) : value;
}
