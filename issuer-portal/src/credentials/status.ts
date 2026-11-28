/**
 * THE status presentation of the issuer portal (docs/design/design-system.md, Status colours):
 * every effective status maps to one of the four status colour sets, with its own icon and its
 * own word (`credentials.statuses.<status>`), so colour is never the only signal.
 *
 * | Effective status | Colour set | Icon         | English         | Sinhala             |
 * | ---------------- | ---------- | ------------ | --------------- | ------------------- |
 * | valid            | valid      | circle-check | Valid           | වලංගුයි             |
 * | pending          | pending    | hourglass    | Awaiting wallet | පසුම්බිය සඳහා රැඳී ඇති |
 * | revoked          | revoked    | ban          | Revoked         | අවලංගු කළ           |
 * | superseded       | pending    | swap (⇄)     | Replaced        | ප්‍රතිස්ථාපනය කළ      |
 * | expired          | expired    | clock        | Expired         | කල් ඉකුත් වූ         |
 *
 * The wallet maps the same statuses in wallet/src/credentials/status.ts; its test checks the
 * shared words match.
 */
import type { StatusSet } from '@univault/portal-ui';
import { ArrowLeftRight, Ban, CircleCheck, Clock, Hourglass, type LucideIcon } from 'lucide-react';
import type { EffectiveStatus } from '../api/credentials.js';

export interface StatusPresentation {
  set: StatusSet;
  icon: LucideIcon;
}

export const STATUS_PRESENTATION: Record<EffectiveStatus, StatusPresentation> = {
  valid: { set: 'valid', icon: CircleCheck },
  pending: { set: 'pending', icon: Hourglass },
  revoked: { set: 'revoked', icon: Ban },
  superseded: { set: 'pending', icon: ArrowLeftRight },
  expired: { set: 'expired', icon: Clock },
};
