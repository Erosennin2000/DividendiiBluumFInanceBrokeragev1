-- Dividendii platform database.
--
-- This holds only what Dividendii needs and Bluum does not keep for us:
-- our own logins, the one-time codes, a record of KYC documents we handled,
-- gifts, webhook events and an audit trail.
--
-- Money, holdings, orders and offerings are NOT stored here. They live at
-- Bluum and are read through the API, so there is one source of truth.
--
-- Apply with:  psql "$DATABASE_URL" -f src/db/schema.sql
-- or:          npm run migrate --workspace server

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  phone           TEXT,
  country         TEXT,
  -- Bluum's investor id (inv_...). Null until onboarding starts.
  investor_id     TEXT UNIQUE,
  -- Mirror of Bluum's investor status, refreshed from webhooks. Display only.
  investor_status TEXT,
  is_staff        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);

-- One-time codes for email sign-in. The code itself is hashed, never stored
-- in the clear, and a row is deleted as soon as it is used.
CREATE TABLE IF NOT EXISTS login_codes (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes (email);

-- A record that a document was handled, for the audit trail. With
-- KYC_STORAGE=forward-only (the default) stored_path stays null: the file is
-- streamed to Bluum and never written to disk.
CREATE TABLE IF NOT EXISTS kyc_documents (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  original_name TEXT,
  byte_size     INTEGER,
  mime_type     TEXT,
  sha256        TEXT,
  stored_path   TEXT,
  forwarded_at  TIMESTAMPTZ,
  bluum_doc_id  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kyc_documents_user_idx ON kyc_documents (user_id);

-- Gifts. Bluum has no gifting endpoint, so the gift itself lives here and is
-- carried out as an ordinary order once the recipient is ready.
CREATE TABLE IF NOT EXISTS gifts (
  id               TEXT PRIMARY KEY,
  from_user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  to_email         TEXT NOT NULL,
  to_user_id       TEXT REFERENCES users (id) ON DELETE SET NULL,
  symbol           TEXT NOT NULL,
  amount           NUMERIC(20, 4) NOT NULL,
  currency         TEXT NOT NULL,
  message          TEXT,
  -- draft, funded, placed, delivered, refunded, cancelled
  status           TEXT NOT NULL DEFAULT 'draft',
  client_order_id  TEXT,
  bluum_order_id   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gifts_from_idx ON gifts (from_user_id);
CREATE INDEX IF NOT EXISTS gifts_to_idx ON gifts (to_email);

-- Every webhook Bluum sends, stored before it is acted on, so an event is
-- never processed twice and nothing is lost if a handler fails.
CREATE TABLE IF NOT EXISTS webhook_events (
  id            TEXT PRIMARY KEY,
  event_id      TEXT UNIQUE,
  event_type    TEXT NOT NULL,
  signature_ok  BOOLEAN NOT NULL,
  payload       JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at  TIMESTAMPTZ,
  error         TEXT
);
CREATE INDEX IF NOT EXISTS webhook_events_type_idx ON webhook_events (event_type);

-- Our own label on an order, so we can tell a gift purchase from an ordinary
-- one. Bluum knows the order by client_order_id.
CREATE TABLE IF NOT EXISTS order_tags (
  client_order_id TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose         TEXT NOT NULL DEFAULT 'self',
  gift_id         TEXT REFERENCES gifts (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keys we have already answered, so a repeated request is not carried out
-- twice even if the customer taps twice.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         TEXT PRIMARY KEY,
  user_id     TEXT,
  endpoint    TEXT NOT NULL,
  response    JSONB,
  status_code INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id       BIGSERIAL PRIMARY KEY,
  user_id  TEXT,
  action   TEXT NOT NULL,
  detail   TEXT,
  ip       TEXT,
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_user_idx ON audit_log (user_id);
