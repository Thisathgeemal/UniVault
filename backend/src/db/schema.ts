/**
 * Drizzle ORM table definitions – typed access to the tables created by
 * migrations/0001–0006. The SQL migrations are the source of truth for
 * structure and constraints; test/db/schema.test.ts checks the two match.
 */
import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

export const issuerType = pgEnum('issuer_type', ['employer', 'bank']);
export const issuerKeyStatus = pgEnum('issuer_key_status', ['active', 'retired']);
export const staffRole = pgEnum('staff_role', ['admin', 'officer']);
export const holderRecordType = pgEnum('holder_record_type', ['employee', 'customer']);
export const credentialType = pgEnum('credential_type', ['EmploymentCredential', 'KYCCredential']);
export const credentialStatus = pgEnum('credential_status', [
  'pending',
  'valid',
  'revoked',
  'superseded',
]);

export const issuers = pgTable('issuers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  issuerType: issuerType('issuer_type').notNull(),
  emailDomain: text('email_domain'),
  ...timestamps,
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const issuerKeys = pgTable('issuer_keys', {
  kid: text('kid').primaryKey(),
  issuerId: text('issuer_id')
    .notNull()
    .references(() => issuers.id),
  alg: text('alg').notNull().default('RS256'),
  publicJwk: jsonb('public_jwk').$type<Record<string, unknown>>().notNull(),
  status: issuerKeyStatus('status').notNull().default('active'),
  ...timestamps,
  retiredAt: timestamp('retired_at', { withTimezone: true }),
});

export const issuerStaff = pgTable('issuer_staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  issuerId: text('issuer_id')
    .notNull()
    .references(() => issuers.id),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: staffRole('role').notNull().default('officer'),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  ...timestamps,
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const holders = pgTable('holders', {
  id: uuid('id').primaryKey().defaultRandom(),
  issuerId: text('issuer_id')
    .notNull()
    .references(() => issuers.id),
  recordType: holderRecordType('record_type').notNull(),
  externalRef: text('external_ref').notNull(),
  fullName: text('full_name').notNull(),
  claims: jsonb('claims').$type<Record<string, unknown>>().notNull(),
  subjectRef: text('subject_ref'),
  createdByStaffId: uuid('created_by_staff_id').references(() => issuerStaff.id),
  ...timestamps,
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const credentialRecords = pgTable('credential_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  issuerId: text('issuer_id')
    .notNull()
    .references(() => issuers.id),
  holderId: uuid('holder_id')
    .notNull()
    .references(() => holders.id),
  credentialType: credentialType('credential_type').notNull(),
  vct: text('vct').notNull(),
  schemaVersion: text('schema_version').notNull().default('1.0'),
  status: credentialStatus('status').notNull().default('pending'),
  claimsSnapshot: jsonb('claims_snapshot').$type<Record<string, unknown>>().notNull(),
  issuerKid: text('issuer_kid').references(() => issuerKeys.kid),
  holderKeyThumbprint: text('holder_key_thumbprint'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  statusUpdatedAt: timestamp('status_updated_at', { withTimezone: true }).notNull().defaultNow(),
  /** Set iff status = 'revoked' (with revocationReason). */
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revocationReason: text('revocation_reason'),
  revokedByStaffId: uuid('revoked_by_staff_id').references(() => issuerStaff.id),
  /** Set iff status = 'superseded' (migration 0005). */
  supersededAt: timestamp('superseded_at', { withTimezone: true }),
  supersededByStaffId: uuid('superseded_by_staff_id').references(() => issuerStaff.id),
  replacesCredentialId: uuid('replaces_credential_id')
    .unique()
    .references((): AnyPgColumn => credentialRecords.id),
  createdByStaffId: uuid('created_by_staff_id').references(() => issuerStaff.id),
  ...timestamps,
});

export const credentialOffers = pgTable('credential_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  credentialId: uuid('credential_id')
    .notNull()
    .references(() => credentialRecords.id),
  preAuthorizedCodeHash: text('pre_authorized_code_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
  redeemedWalletThumbprint: text('redeemed_wallet_thumbprint'),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  /** Set when a newer offer for the same credential replaced this one (migration 0004). */
  invalidatedAt: timestamp('invalidated_at', { withTimezone: true }),
  /**
   * Why it was invalidated (migration 0008): 'replaced' | 'cancelled' | 'credential_revoked' |
   * 'credential_superseded'; set exactly when invalidatedAt is.
   */
  invalidationReason: text('invalidation_reason'),
  createdByStaffId: uuid('created_by_staff_id').references(() => issuerStaff.id),
  ...timestamps,
});

/**
 * Append-only status history of each credential (migration 0005, Decision 012).
 * fromStatus is null only for creation; staffId is null for wallet-driven events.
 */
export const credentialStatusEvents = pgTable('credential_status_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  credentialId: uuid('credential_id')
    .notNull()
    .references(() => credentialRecords.id),
  issuerId: text('issuer_id')
    .notNull()
    .references(() => issuers.id),
  fromStatus: credentialStatus('from_status'),
  toStatus: credentialStatus('to_status').notNull(),
  reason: text('reason'),
  note: text('note'),
  staffId: uuid('staff_id').references(() => issuerStaff.id),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Relations (for typed joins with db.query.*.findMany({ with: … }))
// ---------------------------------------------------------------------------
export const issuersRelations = relations(issuers, ({ many }) => ({
  keys: many(issuerKeys),
  staff: many(issuerStaff),
  holders: many(holders),
  credentials: many(credentialRecords),
}));

export const issuerKeysRelations = relations(issuerKeys, ({ one }) => ({
  issuer: one(issuers, { fields: [issuerKeys.issuerId], references: [issuers.id] }),
}));

export const issuerStaffRelations = relations(issuerStaff, ({ one }) => ({
  issuer: one(issuers, { fields: [issuerStaff.issuerId], references: [issuers.id] }),
}));

export const holdersRelations = relations(holders, ({ one, many }) => ({
  issuer: one(issuers, { fields: [holders.issuerId], references: [issuers.id] }),
  createdBy: one(issuerStaff, { fields: [holders.createdByStaffId], references: [issuerStaff.id] }),
  credentials: many(credentialRecords),
}));

export const credentialRecordsRelations = relations(credentialRecords, ({ one, many }) => ({
  issuer: one(issuers, { fields: [credentialRecords.issuerId], references: [issuers.id] }),
  holder: one(holders, { fields: [credentialRecords.holderId], references: [holders.id] }),
  createdBy: one(issuerStaff, {
    fields: [credentialRecords.createdByStaffId],
    references: [issuerStaff.id],
    relationName: 'credentialCreatedBy',
  }),
  revokedBy: one(issuerStaff, {
    fields: [credentialRecords.revokedByStaffId],
    references: [issuerStaff.id],
    relationName: 'credentialRevokedBy',
  }),
  supersededBy: one(issuerStaff, {
    fields: [credentialRecords.supersededByStaffId],
    references: [issuerStaff.id],
    relationName: 'credentialSupersededBy',
  }),
  signingKey: one(issuerKeys, {
    fields: [credentialRecords.issuerKid],
    references: [issuerKeys.kid],
  }),
  replaces: one(credentialRecords, {
    fields: [credentialRecords.replacesCredentialId],
    references: [credentialRecords.id],
    relationName: 'reissue',
  }),
  replacedBy: many(credentialRecords, { relationName: 'reissue' }),
  offers: many(credentialOffers),
  statusEvents: many(credentialStatusEvents),
}));

export const credentialStatusEventsRelations = relations(credentialStatusEvents, ({ one }) => ({
  credential: one(credentialRecords, {
    fields: [credentialStatusEvents.credentialId],
    references: [credentialRecords.id],
  }),
  issuer: one(issuers, { fields: [credentialStatusEvents.issuerId], references: [issuers.id] }),
  staff: one(issuerStaff, {
    fields: [credentialStatusEvents.staffId],
    references: [issuerStaff.id],
  }),
}));

export const credentialOffersRelations = relations(credentialOffers, ({ one }) => ({
  credential: one(credentialRecords, {
    fields: [credentialOffers.credentialId],
    references: [credentialRecords.id],
  }),
  createdBy: one(issuerStaff, {
    fields: [credentialOffers.createdByStaffId],
    references: [issuerStaff.id],
  }),
}));

export type Issuer = typeof issuers.$inferSelect;
export type NewIssuer = typeof issuers.$inferInsert;
export type IssuerKey = typeof issuerKeys.$inferSelect;
export type IssuerStaffMember = typeof issuerStaff.$inferSelect;
export type Holder = typeof holders.$inferSelect;
export type NewHolder = typeof holders.$inferInsert;
export type CredentialRecord = typeof credentialRecords.$inferSelect;
export type NewCredentialRecord = typeof credentialRecords.$inferInsert;
export type CredentialOffer = typeof credentialOffers.$inferSelect;
export type CredentialStatusEvent = typeof credentialStatusEvents.$inferSelect;
export type NewCredentialStatusEvent = typeof credentialStatusEvents.$inferInsert;
