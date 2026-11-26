/**
 * Showing the claims of a credential preview. The values come ONLY from the backend's preview
 * response (POST /credentials/preview, Decision 019); this file groups and formats them for
 * reading, it never builds or changes a claim.
 */
import type { CredentialTypeName } from '@univault/claims-validation';
import type { TFunction } from 'i18next';
import type { CredentialPreview } from '../api/credentials.js';
import { optionLabel } from '../holders/display.js';
import { EXTERNAL_REF, FORM_UI, inputKind } from '../holders/form-model.js';
import { fieldLabel, tKey } from '../holders/validation.js';
import { formatCalendarDate } from '../lib/format.js';

/** Derived claims are shown next to the claim they come from (Decision 005). */
const DERIVED_NEXT_TO: Record<string, string> = { age_over_18: 'date_of_birth' };
const ADDRESS_PARTS = ['line1', 'line2', 'city', 'district', 'postal_code'] as const;

export interface DisplayClaim {
  name: string;
  value: unknown;
  derived: boolean;
}

export interface DisplayGroup {
  id: string;
  claims: DisplayClaim[];
}

/** The preview's claims in the holder form's groups and order; unknown claims go to "other". */
export function groupPreviewClaims(
  type: CredentialTypeName,
  preview: Pick<CredentialPreview, 'disclosable' | 'derived'>,
): DisplayGroup[] {
  const claims: DisplayClaim[] = [
    ...preview.disclosable.map((c) => ({ ...c, derived: false })),
    ...preview.derived.map((c) => ({ ...c, derived: true })),
  ];
  const placed = new Set<string>();
  const groups = FORM_UI[type].map((group) => {
    const names = [
      ...new Set(
        group.fields.filter((f) => f.path !== EXTERNAL_REF).map((f) => f.path.split('.')[0]!),
      ),
    ];
    const ordered = names.flatMap((name) => [
      name,
      ...Object.entries(DERIVED_NEXT_TO)
        .filter(([, next]) => next === name)
        .map(([derived]) => derived),
    ]);
    const inGroup = ordered
      .map((name) => claims.find((c) => c.name === name))
      .filter((c): c is DisplayClaim => c !== undefined);
    for (const c of inGroup) placed.add(c.name);
    return { id: group.id, claims: inGroup };
  });
  const other = claims.filter((c) => !placed.has(c.name));
  return [...groups, { id: 'other', claims: other }].filter((g) => g.claims.length > 0);
}

/** Object claims are labelled like their form group (an address is shown as one value). */
const OBJECT_LABELS: Record<string, string> = {
  permanent_address: 'holders.register.groups.permanentAddress',
  residential_address: 'holders.register.groups.residentialAddress',
};

/** The label of a claim (the holder form's labels; derived age as "Over 18"). */
export function claimLabel(t: TFunction, name: string): string {
  if (name === 'age_over_18') return t('issuance.preview.over18');
  const objectLabel = OBJECT_LABELS[name];
  return objectLabel ? tKey(t, objectLabel) : fieldLabel(t, name);
}

/** A claim value as text: option labels, dates in the language's style, addresses on one line. */
export function formatClaimValue(
  t: TFunction,
  type: CredentialTypeName,
  name: string,
  value: unknown,
  language: string,
  exists: (key: string) => boolean,
): string {
  if (typeof value === 'boolean')
    return value ? t('issuance.preview.yes') : t('issuance.preview.no');
  if (name === 'portrait') return t('issuance.details.photo');
  if (value && typeof value === 'object') {
    const address = value as Record<string, unknown>;
    return ADDRESS_PARTS.filter((part) => typeof address[part] === 'string' && address[part])
      .map((part) => {
        const text = String(address[part]);
        return part === 'district' ? optionLabel(t, `${name}.district`, text, exists) : text;
      })
      .join(', ');
  }
  const text = String(value);
  const kind = inputKind(type, { path: name });
  if (kind === 'select') return optionLabel(t, name, text, exists);
  if (kind === 'date') return formatCalendarDate(text, language);
  return text;
}

/** The plain explanation of an expiry cap; for an ID document, naming the document type. */
export function capExplanation(
  t: TFunction,
  preview: Pick<CredentialPreview, 'expiry' | 'disclosable'>,
): string | null {
  const cap = preview.expiry.cappedBy;
  if (!cap) return null;
  if (cap === 'id_document_expiry') {
    const documentType = preview.disclosable.find((c) => c.name === 'id_document_type')?.value;
    if (documentType === 'passport' || documentType === 'driving_licence') {
      return tKey(t, `issuance.validity.capped.${documentType}`);
    }
  }
  return tKey(t, `issuance.validity.capped.${cap}`);
}
