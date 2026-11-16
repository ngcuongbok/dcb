-- Customer records contain phone HMACs, never raw phone numbers or key codes.
CREATE TABLE IF NOT EXISTS customer_accounts (
  customer_lookup TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_login_sessions (
  token_hash TEXT PRIMARY KEY,
  customer_lookup TEXT NOT NULL REFERENCES customer_accounts(customer_lookup),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_login_sessions_expiry ON customer_login_sessions(expires_at);
CREATE TABLE IF NOT EXISTS customer_auth_limits (
  ip_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS customer_history_entries (
  alias_id TEXT PRIMARY KEY,
  customer_lookup TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  session_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  drive_state TEXT NOT NULL DEFAULT 'unknown',
  thumbnail_file_id TEXT
);
CREATE INDEX IF NOT EXISTS customer_history_owner ON customer_history_entries(customer_lookup, session_date DESC, alias_id);
