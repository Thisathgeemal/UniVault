-- UniVault – why a credential offer stopped working (Decision 021)
--
-- The issuer portal shows a different message for each way an unredeemed offer ends early:
--   'replaced'              a newer offer was created for the same credential
--   'cancelled'             staff cancelled it (POST /credential-offers/:offerId/cancel)
--   'credential_revoked'    its credential was revoked (POST /credentials/:id/revoke)
--   'credential_superseded' its credential was reissued (POST /credentials/:id/reissue)
--
-- invalidation_reason is set exactly when invalidated_at is set. Rows invalidated before
-- this migration are backfilled: 'replaced' when another offer of the same credential was
-- created at the invalidation instant (createOffer uses one timestamp for both), otherwise
-- from the credential's status, otherwise 'replaced' (the only other cause that existed).
-- A new reason needs a new migration.

ALTER TABLE credential_offers ADD COLUMN invalidation_reason text;

UPDATE credential_offers AS o
SET invalidation_reason = CASE
    WHEN EXISTS (
      SELECT 1 FROM credential_offers AS n
      WHERE n.credential_id = o.credential_id
        AND n.id <> o.id
        AND n.created_at = o.invalidated_at
    ) THEN 'replaced'
    WHEN c.status = 'revoked' THEN 'credential_revoked'
    WHEN c.status = 'superseded' THEN 'credential_superseded'
    ELSE 'replaced'
  END
FROM credential_records AS c
WHERE c.id = o.credential_id
  AND o.invalidated_at IS NOT NULL;

ALTER TABLE credential_offers
  ADD CONSTRAINT credential_offers_invalidation_reason_value CHECK (
    invalidation_reason IS NULL OR invalidation_reason IN (
      'replaced',
      'cancelled',
      'credential_revoked',
      'credential_superseded'
    )
  ),
  ADD CONSTRAINT credential_offers_invalidation_reason_with_time CHECK (
    (invalidated_at IS NULL) = (invalidation_reason IS NULL)
  );
