PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS monthly_digest_reports (
	id TEXT PRIMARY KEY,
	report_month TEXT NOT NULL UNIQUE,
	slug TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	summary_json TEXT NOT NULL DEFAULT '{}',
	body_json TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	published_at TEXT
);

CREATE TABLE IF NOT EXISTS monthly_digest_batches (
	id TEXT PRIMARY KEY,
	report_month TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'completed_with_failures', 'failed')),
	triggered_by_type TEXT NOT NULL CHECK (triggered_by_type IN ('system', 'admin')),
	triggered_by_user TEXT,
	included_source_count INTEGER NOT NULL DEFAULT 0,
	excluded_source_count INTEGER NOT NULL DEFAULT 0,
	email_sent_count INTEGER NOT NULL DEFAULT 0,
	email_failed_count INTEGER NOT NULL DEFAULT 0,
	report_id TEXT REFERENCES monthly_digest_reports(id) ON DELETE SET NULL,
	summary_json TEXT NOT NULL DEFAULT '{}',
	error_message TEXT,
	started_at TEXT NOT NULL,
	finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_monthly_digest_batches_status_started_at
	ON monthly_digest_batches(status, started_at DESC);

CREATE TABLE IF NOT EXISTS monthly_digest_batch_sources (
	id TEXT PRIMARY KEY,
	batch_id TEXT NOT NULL REFERENCES monthly_digest_batches(id) ON DELETE CASCADE,
	source_id TEXT NOT NULL REFERENCES source_registry(id) ON DELETE CASCADE,
	crawl_run_id TEXT REFERENCES crawl_runs(id) ON DELETE SET NULL,
	outcome TEXT NOT NULL CHECK (
		outcome IN ('included', 'excluded_failed', 'excluded_incomplete', 'excluded_empty')
	),
	completeness_ratio REAL,
	discovered_count INTEGER NOT NULL DEFAULT 0,
	normalized_count INTEGER NOT NULL DEFAULT 0,
	error_message TEXT,
	details_json TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE(batch_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_digest_batch_sources_batch
	ON monthly_digest_batch_sources(batch_id, outcome, updated_at DESC);

CREATE TABLE IF NOT EXISTS monthly_digest_recipient_deliveries (
	id TEXT PRIMARY KEY,
	report_id TEXT NOT NULL REFERENCES monthly_digest_reports(id) ON DELETE CASCADE,
	subscriber_id TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
	email_event_id TEXT REFERENCES email_events(id) ON DELETE SET NULL,
	delivery_status TEXT NOT NULL CHECK (delivery_status IN ('queued', 'sent', 'failed', 'skipped')),
	provider_name TEXT,
	provider_message_id TEXT,
	error_message TEXT,
	attempted_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE(report_id, subscriber_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_digest_recipient_deliveries_report
	ON monthly_digest_recipient_deliveries(report_id, attempted_at DESC);
