-- UniVault – initial database schema (PostgreSQL)
-- Issuers, their signing keys and staff; holder records; credential records
-- (including revoke-then-reissue chains); and pre-authorised credential offers.
-- Integrity rules are enforced by the database itself (keys, CHECKs, indexes),
-- not only by application code.

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
CREATE TYPE issuer_type AS ENUM ('employer', 'bank');
CREATE TYPE issuer_key_status AS ENUM ('active', 'retired');
CREATE TYPE staff_role AS ENUM ('admin', 'officer');
CREATE TYPE holder_record_type AS ENUM ('employee', 'customer');
CREATE TYPE credential_type AS ENUM ('EmploymentCredential', 'KYCCredential');
-- pending    = created by issuer staff, offered, not yet delivered to a wallet
-- valid      = signed and delivered to the holder's wallet
-- revoked    = withdrawn by the issuer (e.g. employee resigned)
-- superseded = replaced by a reissued credential (FR-ISS-03)
CREATE TYPE credential_status AS ENUM ('pending', 'valid', 'revoked', 'superseded');

-- Keeps updated_at current on every UPDATE
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Issuers: employers and banks that issue credentials
-- ---------------------------------------------------------------------------
CREATE TABLE issuers (
  id           text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{3,40}$'),  -- e.g. 'employer-a'
  name         text NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  issuer_type  issuer_type NOT NULL,
  email_domain text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER issuers_updated_at BEFORE UPDATE ON issuers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Issuer keys: RS256 PUBLIC keys only (private keys stay encrypted on disk).
-- Separate table so keys can be rotated: old credentials keep pointing at the
-- retired key they were signed with.
-- ---------------------------------------------------------------------------
CREATE TABLE issuer_keys (
  kid        text PRIMARY KEY CHECK (kid ~ '^[A-Za-z0-9_-]{43}$'),  -- RFC 7638 thumbprint
  issuer_id  text NOT NULL REFERENCES issuers (id) ON DELETE RESTRICT,
  alg        text NOT NULL DEFAULT 'RS256' CHECK (alg = 'RS256'),
  public_jwk jsonb NOT NULL CHECK (public_jwk ->> 'kty' = 'RSA' AND public_jwk ->> 'kid' = kid),
  status     issuer_key_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CHECK ((status = 'retired') = (retired_at IS NOT NULL))
);
-- At most one active signing key per issuer
CREATE UNIQUE INDEX issuer_keys_one_active_per_issuer ON issuer_keys (issuer_id) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Issuer staff: people who log in to the issuer portal
-- ---------------------------------------------------------------------------
CREATE TABLE issuer_staff (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id     text NOT NULL REFERENCES issuers (id) ON DELETE CASCADE,
  email         text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+$'),
  display_name  text NOT NULL,
  password_hash text NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
  role          staff_role NOT NULL DEFAULT 'officer',
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX issuer_staff_email_unique ON issuer_staff (lower(email));
CREATE INDEX issuer_staff_issuer_idx ON issuer_staff (issuer_id);
CREATE TRIGGER issuer_staff_updated_at BEFORE UPDATE ON issuer_staff
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Holders: the issuer's own record of an employee or customer.
-- The same person at two issuers is two holder rows (issuers are independent).
-- ---------------------------------------------------------------------------
CREATE TABLE holders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id    text NOT NULL REFERENCES issuers (id) ON DELETE RESTRICT,
  record_type  holder_record_type NOT NULL,
  external_ref text NOT NULL,                 -- employee ID or customer reference
  full_name    text NOT NULL,                 -- copied from claims for search and display
  claims       jsonb NOT NULL CHECK (jsonb_typeof(claims) = 'object'),  -- subject claims (docs/schemas)
  subject_ref  text,                          -- synthetic person ID from seed data (test data only)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (issuer_id, external_ref)
);
CREATE INDEX holders_issuer_name_idx ON holders (issuer_id, lower(full_name));
CREATE TRIGGER holders_updated_at BEFORE UPDATE ON holders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Credential records: one row per credential issued (id = the credential's jti).
-- The signed SD-JWT itself is NOT stored – only what the issuer needs for
-- status, revocation, reissue and audit.
-- ---------------------------------------------------------------------------
CREATE TABLE credential_records (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id              text NOT NULL REFERENCES issuers (id) ON DELETE RESTRICT,
  holder_id              uuid NOT NULL REFERENCES holders (id) ON DELETE RESTRICT,
  credential_type        credential_type NOT NULL,
  vct                    text NOT NULL,
  schema_version         text NOT NULL DEFAULT '1.0',
  status                 credential_status NOT NULL DEFAULT 'pending',
  claims_snapshot        jsonb NOT NULL CHECK (jsonb_typeof(claims_snapshot) = 'object'),
  issuer_kid             text REFERENCES issuer_keys (kid) ON DELETE RESTRICT,  -- key it was signed with
  holder_key_thumbprint  text,               -- wallet key (cnf) the credential is bound to
  issued_at              timestamptz,        -- when signed and delivered to the wallet
  expires_at             timestamptz NOT NULL,
  status_updated_at      timestamptz NOT NULL DEFAULT now(),
  revoked_at             timestamptz,
  revocation_reason      text,
  -- Reissue chain: the new credential points at the one it replaces (FR-ISS-03)
  replaces_credential_id uuid UNIQUE REFERENCES credential_records (id) ON DELETE RESTRICT,
  created_by_staff_id    uuid REFERENCES issuer_staff (id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (replaces_credential_id IS NULL OR replaces_credential_id <> id),
  -- Anything past 'pending' must have been signed: needs issue time and key
  CHECK (status = 'pending' OR (issued_at IS NOT NULL AND issuer_kid IS NOT NULL AND holder_key_thumbprint IS NOT NULL)),
  CHECK (issued_at IS NULL OR expires_at > issued_at),
  -- Revoked and superseded credentials always record when; others never do
  CHECK ((status IN ('revoked', 'superseded')) = (revoked_at IS NOT NULL))
);
CREATE INDEX credential_records_holder_idx ON credential_records (holder_id);
CREATE INDEX credential_records_issuer_status_idx ON credential_records (issuer_id, status);

-- ---------------------------------------------------------------------------
-- Credential offers: pre-authorised offers shown as QR codes (FR-ISS-01).
-- Only a SHA-256 hash of the pre-authorised code is stored, like a password.
-- ---------------------------------------------------------------------------
CREATE TABLE credential_offers (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id              uuid NOT NULL REFERENCES credential_records (id) ON DELETE CASCADE,
  pre_authorized_code_hash   text NOT NULL UNIQUE CHECK (length(pre_authorized_code_hash) = 43),
  expires_at                 timestamptz NOT NULL,
  redeemed_at                timestamptz,
  redeemed_wallet_thumbprint text,
  failed_attempts            integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  created_by_staff_id        uuid REFERENCES issuer_staff (id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK ((redeemed_at IS NULL) = (redeemed_wallet_thumbprint IS NULL))
);
CREATE INDEX credential_offers_credential_idx ON credential_offers (credential_id);
