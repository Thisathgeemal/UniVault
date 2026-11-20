-- UniVault – login protection for issuer staff
-- Counts consecutive failed logins and locks the account temporarily after
-- too many, to slow down password guessing.

ALTER TABLE issuer_staff
  ADD COLUMN failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  ADD COLUMN locked_until timestamptz;
