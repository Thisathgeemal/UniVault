/**
 * The holder registration form, generated from the credential JSON Schemas (docs/schemas, via
 * the build-time 'virtual:claims-validators' module) plus a small UI config: which group a
 * field is in, its order, and an input hint where the schema alone can't tell (phone numbers).
 *
 * Everything that is a RULE comes from the schema: required fields (including the allOf
 * if/then rules), allowed options, formats, lengths. Never copy a rule in here (Decision 018).
 */
import type { CredentialTypeName, RecordType } from '@univault/claims-validation';
import { schemas } from 'virtual:claims-validators';

/** The form's path for the holder reference (outside the claims). */
export const EXTERNAL_REF = 'externalRef';

export type InputKind = 'text' | 'date' | 'select' | 'email' | 'tel';

export interface FieldUi {
  /** Dotted claim path (e.g. "permanent_address.line1"), or EXTERNAL_REF. */
  path: string;
  /** Only where the schema can't tell (it says "string" for phone numbers). */
  input?: 'tel';
  autoComplete?: string;
  /** Shown only while the schema requires it (allOf if/then), e.g. the ID document expiry. */
  conditional?: boolean;
}

export interface GroupUi {
  id: string;
  fields: readonly FieldUi[];
  /** An optional object claim the user switches on (e.g. a different residential address). */
  optionalObject?: string;
}

const address = (prefix: string): FieldUi[] => [
  { path: `${prefix}.line1`, autoComplete: 'address-line1' },
  { path: `${prefix}.line2`, autoComplete: 'address-line2' },
  { path: `${prefix}.city`, autoComplete: 'address-level2' },
  { path: `${prefix}.district` },
  { path: `${prefix}.postal_code`, autoComplete: 'postal-code' },
];

/** Field order and grouping per credential type. */
export const FORM_UI: Record<CredentialTypeName, readonly GroupUi[]> = {
  EmploymentCredential: [
    {
      id: 'personal',
      fields: [{ path: 'full_name', autoComplete: 'off' }, { path: 'nic_number' }],
    },
    {
      id: 'employment',
      fields: [
        { path: 'employee_id' },
        { path: 'designation' },
        { path: 'department' },
        { path: 'employment_type' },
        { path: 'date_of_joining' },
        { path: 'work_location' },
      ],
    },
    {
      id: 'contact',
      fields: [{ path: 'work_email' }, { path: 'work_phone', input: 'tel' }],
    },
  ],
  KYCCredential: [
    { id: 'account', fields: [{ path: EXTERNAL_REF }] },
    {
      id: 'personal',
      fields: [
        { path: 'full_name', autoComplete: 'off' },
        { path: 'date_of_birth' },
        { path: 'nationality' },
        { path: 'occupation' },
        { path: 'employer_name' },
        { path: 'public_position' },
      ],
    },
    {
      id: 'identity',
      fields: [
        { path: 'id_document_type' },
        { path: 'id_document_number' },
        { path: 'id_document_expiry', conditional: true },
      ],
    },
    {
      id: 'contact',
      fields: [{ path: 'mobile_number', input: 'tel' }, { path: 'email' }],
    },
    { id: 'permanentAddress', fields: address('permanent_address') },
    {
      id: 'residentialAddress',
      optionalObject: 'residential_address',
      fields: [
        ...address('residential_address'),
        { path: 'residence_proof_type', conditional: true },
      ],
    },
  ],
};

/**
 * Schema properties deliberately NOT in the form (a test checks every property is either in
 * FORM_UI or here): age_over_18 is calculated by the server (Decision 005); the portrait (a
 * JPEG upload) is not offered yet.
 */
export const OMITTED_CLAIMS: Record<CredentialTypeName, readonly string[]> = {
  EmploymentCredential: ['portrait'],
  KYCCredential: ['age_over_18', 'portrait'],
};

/** Constant values the user never types (schema `const`), e.g. address country "LK". */
const constOf = (schema: JsonSchema | undefined): string | undefined =>
  typeof schema?.const === 'string' ? schema.const : undefined;

export const RECORD_TYPE_OF: Record<CredentialTypeName, RecordType> = {
  EmploymentCredential: 'employee',
  KYCCredential: 'customer',
};
export const CREDENTIAL_TYPE_OF_ISSUER = {
  employer: 'EmploymentCredential',
  bank: 'KYCCredential',
} as const satisfies Record<string, CredentialTypeName>;

// ---------------------------------------------------------------------------
// Reading the schema

export interface JsonSchema {
  type?: string;
  format?: string;
  enum?: unknown[];
  const?: unknown;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  $ref?: string;
  allOf?: { if?: JsonSchema; then?: JsonSchema }[];
  $defs?: Record<string, JsonSchema>;
}

const rootOf = (type: CredentialTypeName) => schemas[type] as JsonSchema;

function resolve(root: JsonSchema, schema: JsonSchema | undefined): JsonSchema | undefined {
  const ref = schema?.$ref;
  if (!ref) return schema;
  const name = /^#\/\$defs\/(.+)$/.exec(ref)?.[1];
  return name ? root.$defs?.[name] : undefined;
}

/** The schema of a claim path ("permanent_address.city"), following $ref. */
export function propertySchema(type: CredentialTypeName, path: string): JsonSchema | undefined {
  const root = rootOf(type);
  let current: JsonSchema | undefined = root;
  for (const part of path.split('.')) {
    current = resolve(root, resolve(root, current)?.properties?.[part]);
    if (!current) return undefined;
  }
  return current;
}

/** Every leaf claim path of a type (object claims expanded), e.g. for the coverage test. */
export function schemaLeafPaths(type: CredentialTypeName): string[] {
  const root = rootOf(type);
  return Object.entries(root.properties ?? {}).flatMap(([name, prop]) => {
    const resolved = resolve(root, prop);
    return resolved?.type === 'object'
      ? Object.keys(resolved.properties ?? {}).map((child) => `${name}.${child}`)
      : [name];
  });
}

export function inputKind(type: CredentialTypeName, field: FieldUi): InputKind {
  if (field.input) return field.input;
  const schema = propertySchema(type, field.path);
  if (schema?.enum) return 'select';
  if (schema?.format === 'date') return 'date';
  if (schema?.format === 'email') return 'email';
  return 'text';
}

export const enumOptions = (type: CredentialTypeName, path: string): string[] =>
  (propertySchema(type, path)?.enum ?? []).map(String);

export const maxLengthOf = (type: CredentialTypeName, path: string): number | undefined =>
  propertySchema(type, path)?.maxLength;

// ---------------------------------------------------------------------------
// Form values <-> claims

/** Flat form state: path -> text. */
export type FormValues = Record<string, string>;

export interface FormState {
  values: FormValues;
  /** Optional object claims switched on (e.g. residential_address). */
  objects: Record<string, boolean>;
}

/** Defaults for a new record: the schema's examples where it gives one value for a country. */
export function initialFormState(type: CredentialTypeName): FormState {
  const values: FormValues = {};
  for (const group of FORM_UI[type]) for (const field of group.fields) values[field.path] = '';
  if (type === 'KYCCredential') {
    // The NIC is the usual ID document of a Sri Lankan resident; nationality LK (both are
    // ordinary choices the user can change, not rules)
    values.id_document_type = 'nic';
    values.nationality = 'LK';
  }
  return { values, objects: {} };
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let node = target;
  for (const part of parts.slice(0, -1)) {
    node[part] ??= {};
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]!] = value;
}

/** Object claims that are part of the record (required ones always, optional ones if on). */
function includedObjects(type: CredentialTypeName, state: FormState): string[] {
  return FORM_UI[type].flatMap((group) => {
    const objects = new Set(
      group.fields
        .map((f) => f.path.split('.'))
        .filter((p) => p.length > 1)
        .map((p) => p[0]!),
    );
    return [...objects].filter((name) => !group.optionalObject || state.objects[name]);
  });
}

/**
 * The claims the form describes: trimmed text, empty fields left out, hidden conditional
 * fields left out, and schema constants (address country) filled in.
 */
export function toClaims(type: CredentialTypeName, state: FormState): Record<string, unknown> {
  const claims: Record<string, unknown> = {};
  const objects = includedObjects(type, state);
  for (const group of FORM_UI[type]) {
    for (const field of group.fields) {
      if (field.path === EXTERNAL_REF) continue;
      const object = field.path.includes('.') ? field.path.split('.')[0]! : null;
      if (group.optionalObject && !state.objects[group.optionalObject]) continue;
      if (object && !objects.includes(object)) continue;
      const value = (state.values[field.path] ?? '').trim();
      if (value) setPath(claims, field.path, value);
    }
  }
  // Constants first: a switched-on object then counts as present for the if/then rules
  for (const object of objects) {
    const objectSchema = propertySchema(type, object);
    for (const [name, prop] of Object.entries(objectSchema?.properties ?? {})) {
      const constant = constOf(prop);
      if (constant !== undefined) setPath(claims, `${object}.${name}`, constant);
    }
  }
  // Leave out conditional fields the schema does not ask for (top-level claims only)
  const required = requiredPaths(type, claims);
  for (const group of FORM_UI[type]) {
    for (const field of group.fields) {
      if (field.conditional && !required.has(field.path)) delete claims[field.path];
    }
  }
  return claims;
}

export const toExternalRef = (state: FormState): string | undefined =>
  state.values[EXTERNAL_REF]?.trim() || undefined;

// ---------------------------------------------------------------------------
// Required fields, including the allOf if/then rules

/** if-clause keywords this evaluator understands; a test fails if a schema uses another. */
export const SUPPORTED_IF_KEYWORDS = ['properties', 'required'] as const;

/**
 * Whether `claims` match an `if` subschema, with JSON Schema semantics for the keywords the
 * credential schemas use: `properties` (each present property must equal its `const`; a
 * missing property passes) and `required`.
 */
export function matchesIf(condition: JsonSchema, claims: Record<string, unknown>): boolean {
  for (const [name, sub] of Object.entries(condition.properties ?? {})) {
    if (name in claims && sub.const !== undefined && claims[name] !== sub.const) return false;
  }
  return (condition.required ?? []).every((name) => name in claims);
}

/** The allOf rules whose `if` currently matches. */
export function activeRules(type: CredentialTypeName, claims: Record<string, unknown>) {
  return (rootOf(type).allOf ?? []).filter((rule) => rule.if && matchesIf(rule.if, claims));
}

/** The claim paths the schema requires for these claims (top level and inside objects). */
export function requiredPaths(
  type: CredentialTypeName,
  claims: Record<string, unknown>,
): Set<string> {
  const root = rootOf(type);
  const required = new Set(root.required ?? []);
  for (const rule of activeRules(type, claims)) {
    for (const name of rule.then?.required ?? []) required.add(name);
  }
  for (const [name, prop] of Object.entries(root.properties ?? {})) {
    const resolved = resolve(root, prop);
    if (resolved?.type !== 'object') continue;
    if (!required.has(name) && !(name in claims)) continue;
    for (const child of resolved.required ?? []) required.add(`${name}.${child}`);
  }
  return required;
}

/**
 * The fields shown for the current state, with whether each is required. Conditional fields
 * appear only while required; fields of a switched-off optional object are hidden.
 */
export function visibleFields(type: CredentialTypeName, state: FormState, recordType: RecordType) {
  const claims = toClaims(type, state);
  // An optional object that is switched on counts as present (its fields become required)
  for (const [name, on] of Object.entries(state.objects)) if (on) claims[name] ??= {};
  const required = requiredPaths(type, claims);
  return FORM_UI[type].map((group) => ({
    group,
    hidden: Boolean(group.optionalObject && !state.objects[group.optionalObject]),
    fields: group.fields
      .filter((field) => !field.conditional || required.has(field.path))
      .map((field) => ({
        field,
        required:
          field.path === EXTERNAL_REF ? recordType === 'customer' : required.has(field.path),
      })),
  }));
}

/** The pattern the schema currently applies to a field (e.g. the ID number for a passport). */
export function activePattern(
  type: CredentialTypeName,
  path: string,
  claims: Record<string, unknown>,
): string | undefined {
  for (const rule of activeRules(type, claims)) {
    const pattern = rule.then?.properties?.[path]?.pattern;
    if (pattern) return pattern;
  }
  return propertySchema(type, path)?.pattern;
}

/** The HTML id of a field (the error summary links to it). */
export const fieldId = (path: string) => `holder-${path.replace(/\./g, '-')}`;
