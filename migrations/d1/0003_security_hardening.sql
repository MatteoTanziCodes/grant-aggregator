PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_sessions (
	id TEXT PRIMARY KEY,
	username TEXT NOT NULL,
	created_at TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	last_seen_at TEXT,
	revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_username
	ON admin_sessions(username, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
	ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS rate_limit_events (
	id TEXT PRIMARY KEY,
	action_key TEXT NOT NULL,
	bucket_key TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_lookup
	ON rate_limit_events(action_key, bucket_key, created_at DESC);
