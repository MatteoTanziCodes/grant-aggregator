PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS email_events (
	id TEXT PRIMARY KEY,
	email_type TEXT NOT NULL CHECK (
		email_type IN ('verification', 'grant_update_digest', 'grant_update_alert', 'admin_test')
	),
	recipient_email TEXT NOT NULL,
	subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL,
	verification_token_id TEXT REFERENCES email_verification_tokens(id) ON DELETE SET NULL,
	opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
	provider_name TEXT NOT NULL DEFAULT 'resend',
	provider_message_id TEXT,
	triggered_by_type TEXT NOT NULL CHECK (triggered_by_type IN ('user', 'admin', 'system')),
	triggered_by_user TEXT,
	result_status TEXT NOT NULL CHECK (result_status IN ('queued', 'sent', 'failed', 'skipped')),
	provider_response_summary TEXT,
	error_code TEXT,
	error_message TEXT,
	attempted_at TEXT NOT NULL,
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_events_subscriber_attempted_at
	ON email_events(subscriber_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_events_result_status_attempted_at
	ON email_events(result_status, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_events_verification_token
	ON email_events(verification_token_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_log (
	id TEXT PRIMARY KEY,
	admin_username TEXT NOT NULL,
	action_type TEXT NOT NULL,
	target_subscriber_id TEXT REFERENCES subscribers(id) ON DELETE SET NULL,
	target_email_event_id TEXT REFERENCES email_events(id) ON DELETE SET NULL,
	metadata_json TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
	ON admin_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_subscriber
	ON admin_audit_log(target_subscriber_id, created_at DESC);
