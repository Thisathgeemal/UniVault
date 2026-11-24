-- UniVault – credential revocation, reissue (supersede) and status history
--
-- Reuses the columns 0001 already created: revoked_at, revocation_reason and
-- replaces_credential_id (UNIQUE, so a credential has at most one replacement;
-- CHECK credential_records_check stops a credential replacing itself).
--
-- Changes:
--   1. who revoked / superseded a credential, and when it was superseded;
--   2. superseded credentials record superseded_at instead of revoked_at, and a
--      PENDING credential can be revoked without ever having been signed;
--   3. an append-only history of every status change (credential_status_events),
--      backfilled for credentials that already exist (Decision 012).

-- ---------------------------------------------------------------------------
-- 1. New columns. Two 0001 rules are replaced by the rules in section 4:
--    check1 "anything past pending was signed" (a pending credential can now be
--    revoked unsigned) and check3 "revoked or superseded = revoked_at set".
-- ---------------------------------------------------------------------------
ALTER TABLE credential_records
  ADD COLUMN revoked_by_staff_id    uuid REFERENCES issuer_staff (id) ON DELETE SET NULL,
  ADD COLUMN superseded_at          timestamptz,
  ADD COLUMN superseded_by_staff_id uuid REFERENCES issuer_staff (id) ON DELETE SET NULL,
  DROP CONSTRAINT credential_records_check1,
  DROP CONSTRAINT credential_records_check3,
  -- Target for the composite foreign key below: an event's issuer must be its credential's issuer
  ADD CONSTRAINT credential_records_id_issuer_key UNIQUE (id, issuer_id);

-- ---------------------------------------------------------------------------
-- 2. Status history: one row per status change, never updated or deleted.
--    from_status is NULL only for creation (NULL -> pending).
--    staff_id is NULL for wallet-driven events (signing at redemption) and for
--    backfilled events whose staff member is unknown.
-- ---------------------------------------------------------------------------
CREATE TABLE credential_status_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL,
  issuer_id     text NOT NULL REFERENCES issuers (id) ON DELETE RESTRICT,
  from_status   credential_status,
  to_status     credential_status NOT NULL,
  reason        text CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 60),
  note          text CHECK (note IS NULL OR length(note) BETWEEN 1 AND 500),
  -- RESTRICT, not SET NULL: the table is append-only, so the audit trail keeps its staff member
  staff_id      uuid REFERENCES issuer_staff (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (credential_id, issuer_id)
    REFERENCES credential_records (id, issuer_id) ON DELETE RESTRICT,
  CONSTRAINT credential_status_events_changes_status CHECK (from_status IS DISTINCT FROM to_status),
  CONSTRAINT credential_status_events_creation
    CHECK ((from_status IS NULL) = (to_status = 'pending'))
);
CREATE INDEX credential_status_events_credential_idx
  ON credential_status_events (credential_id, created_at);

-- Append-only: history rows can be added, never changed or removed
CREATE FUNCTION credential_status_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'credential_status_events is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER credential_status_events_no_change
  BEFORE UPDATE OR DELETE ON credential_status_events
  FOR EACH ROW EXECUTE FUNCTION credential_status_events_append_only();

-- ---------------------------------------------------------------------------
-- 3. Backfill the history of existing credentials (before section 4 moves the
--    old superseded reason out of revocation_reason).
-- ---------------------------------------------------------------------------
-- Creation: NULL -> pending
INSERT INTO credential_status_events (credential_id, issuer_id, from_status, to_status, staff_id, created_at)
SELECT id, issuer_id, NULL, 'pending', created_by_staff_id, created_at
FROM credential_records;

-- Signing at redemption: pending -> valid (every credential that was ever signed)
INSERT INTO credential_status_events (credential_id, issuer_id, from_status, to_status, created_at)
SELECT id, issuer_id, 'pending', 'valid', issued_at
FROM credential_records
WHERE issued_at IS NOT NULL;

-- Revoked or superseded: the last change, from valid (if signed) or pending
INSERT INTO credential_status_events (credential_id, issuer_id, from_status, to_status, reason, created_at)
SELECT id, issuer_id,
       CASE WHEN issued_at IS NOT NULL THEN 'valid' ELSE 'pending' END::credential_status,
       status, left(coalesce(revocation_reason, 'other'), 60), status_updated_at
FROM credential_records
WHERE status IN ('revoked', 'superseded');

-- ---------------------------------------------------------------------------
-- 4. Move existing rows to the new rules, then enforce them.
-- ---------------------------------------------------------------------------
UPDATE credential_records
SET superseded_at = coalesce(revoked_at, status_updated_at), revoked_at = NULL, revocation_reason = NULL
WHERE status = 'superseded';

UPDATE credential_records
SET revocation_reason = 'other'
WHERE status = 'revoked' AND revocation_reason IS NULL;

ALTER TABLE credential_records
  -- Signing data (time, issuer key, wallet key) is recorded all together or not at all.
  -- Valid and superseded credentials were signed; pending ones never are; a revoked
  -- credential was signed only if it was revoked after redemption.
  ADD CONSTRAINT credential_records_signing_fields CHECK (
    (issued_at IS NULL) = (issuer_kid IS NULL)
    AND (issued_at IS NULL) = (holder_key_thumbprint IS NULL)
    AND (status = 'revoked' OR (status = 'pending') = (issued_at IS NULL))
  ),
  -- Revoked credentials always record when and why; no other credential has revocation data.
  -- revoked_by_staff_id may be NULL on a revoked row only if that staff member was deleted.
  ADD CONSTRAINT credential_records_revocation_fields CHECK (
    (status = 'revoked') = (revoked_at IS NOT NULL)
    AND (status = 'revoked') = (revocation_reason IS NOT NULL)
    AND (status = 'revoked' OR revoked_by_staff_id IS NULL)
  ),
  -- Superseded credentials always record when; no other credential has supersede data
  ADD CONSTRAINT credential_records_supersede_fields CHECK (
    (status = 'superseded') = (superseded_at IS NOT NULL)
    AND (status = 'superseded' OR superseded_by_staff_id IS NULL)
  );
