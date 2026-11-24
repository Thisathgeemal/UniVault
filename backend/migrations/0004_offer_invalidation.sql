-- UniVault – invalidating superseded credential offers
-- Creating a new offer for a credential invalidates any earlier offer that is
-- still usable, so only ONE offer per credential can be redeemed at a time.
-- NULL = not invalidated. An invalidated offer can never also be redeemed.

ALTER TABLE credential_offers
  ADD COLUMN invalidated_at timestamptz,
  ADD CONSTRAINT credential_offers_not_both_redeemed_and_invalidated
    CHECK (invalidated_at IS NULL OR redeemed_at IS NULL);
