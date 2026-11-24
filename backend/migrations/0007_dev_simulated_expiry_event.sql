-- UniVault – allow the development-only "simulated expiry" status event (Decision 013)
--
-- POST /api/v1/dev/credentials/:id/simulate-expiry (DEV_SIMULATE_REDEMPTION=true only,
-- refused in production; TEMPORARY, removed in Sprint 2) moves a valid credential's
-- expires_at into the past and records that in the status history. 'expired' is computed,
-- never stored, so the event is valid -> valid with reason 'dev_simulated_expiry'. Two
-- rules blocked that row:
--
--   1. credential_status_events_reason_value (0006) did not list the reason. It is
--      re-added with the reason, again NOT VALID (older free-text rows stay unchecked).
--   2. credential_status_events_changes_status (0005) refused from_status = to_status.
--      It now allows that ONLY for 'dev_simulated_expiry'; every real event must still
--      change the status. Existing rows all satisfy the new rule, so it is validated.
--
-- 0006 is not edited (applied migrations are checksum-protected). When the dev routes are
-- removed, keep these constraints: history rows that already use the reason must stay valid.

ALTER TABLE credential_status_events
  DROP CONSTRAINT credential_status_events_reason_value;
ALTER TABLE credential_status_events
  ADD CONSTRAINT credential_status_events_reason_value CHECK (
    reason IS NULL OR reason IN (
      'details_changed',
      'employment_ended',
      'relationship_ended',
      'wallet_lost_or_compromised',
      'issued_in_error',
      'validity_extension',
      'other',
      'dev_simulated_expiry'
    )
  ) NOT VALID;

ALTER TABLE credential_status_events
  DROP CONSTRAINT credential_status_events_changes_status;
ALTER TABLE credential_status_events
  ADD CONSTRAINT credential_status_events_changes_status CHECK (
    from_status IS DISTINCT FROM to_status
    -- IS NOT DISTINCT FROM, not "=": a NULL reason must make this false, not NULL
    -- (a CHECK that evaluates to NULL passes)
    OR (
      reason IS NOT DISTINCT FROM 'dev_simulated_expiry'
      AND from_status IS NOT DISTINCT FROM 'valid'
      AND to_status = 'valid'
    )
  );
