-- UniVault – limit stored reason values to the API enums (Decision 012)
--
-- The API already accepts only these values (REVOCATION_REASONS and
-- REISSUE_REASONS in src/services/credentials.service.ts). These CHECKs make the
-- database enforce them too, for rows written from now on.
--
-- NOT VALID: rows that already exist are NOT checked. Before 0005, reasons were
-- free text (0005 copied them into the status history), and those rows must
-- survive. PostgreSQL still applies the CHECK to every INSERT and to any UPDATE
-- of an old row; revoked/superseded rows are final and status events are
-- append-only, so old rows are never updated.
--
-- When a reason is added to the API, add it here in a new migration (drop and
-- re-add the constraint, again NOT VALID).

-- Revocation reasons (credential_records.revocation_reason; NULL unless revoked,
-- see credential_records_revocation_fields)
ALTER TABLE credential_records
  ADD CONSTRAINT credential_records_revocation_reason_value CHECK (
    revocation_reason IS NULL OR revocation_reason IN (
      'details_changed',
      'employment_ended',
      'relationship_ended',
      'wallet_lost_or_compromised',
      'issued_in_error',
      'other'
    )
  ) NOT VALID;

-- Status history reasons: revocation reasons (-> revoked) and reissue reasons
-- (-> superseded); NULL for creation and signing events
ALTER TABLE credential_status_events
  ADD CONSTRAINT credential_status_events_reason_value CHECK (
    reason IS NULL OR reason IN (
      'details_changed',
      'employment_ended',
      'relationship_ended',
      'wallet_lost_or_compromised',
      'issued_in_error',
      'validity_extension',
      'other'
    )
  ) NOT VALID;
