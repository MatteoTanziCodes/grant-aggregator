PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source_registry (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	kind TEXT NOT NULL CHECK (kind IN ('official', 'aggregator', 'rss', 'institutional')),
	base_url TEXT NOT NULL,
	canonical INTEGER NOT NULL DEFAULT 0 CHECK (canonical IN (0, 1)),
	active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
	crawl_strategy TEXT NOT NULL,
	notes TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crawl_runs (
	id TEXT PRIMARY KEY,
	source_id TEXT NOT NULL REFERENCES source_registry(id) ON DELETE CASCADE,
	status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
	fetched_url TEXT,
	artifact_key TEXT,
	content_hash TEXT,
	discovered_count INTEGER NOT NULL DEFAULT 0,
	normalized_count INTEGER NOT NULL DEFAULT 0,
	error_message TEXT,
	started_at TEXT NOT NULL,
	finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_crawl_runs_source_started_at
	ON crawl_runs(source_id, started_at DESC);

CREATE TABLE IF NOT EXISTS opportunities (
	id TEXT PRIMARY KEY,
	canonical_source_id TEXT NOT NULL REFERENCES source_registry(id),
	title TEXT NOT NULL,
	program_url TEXT NOT NULL,
	organization_name TEXT NOT NULL,
	funding_category TEXT NOT NULL CHECK (
		funding_category IN (
			'grant',
			'non_repayable_contribution',
			'loan',
			'loan_guarantee',
			'pitch_competition',
			'accelerator_funding',
			'incubator_funding',
			'equity_program'
		)
	),
	record_status TEXT NOT NULL CHECK (record_status IN ('draft', 'active', 'closed', 'rejected')),
	amount_min_cad INTEGER,
	amount_max_cad INTEGER,
	summary TEXT,
	eligibility_summary TEXT,
	provinces_json TEXT NOT NULL DEFAULT '[]',
	sectors_json TEXT NOT NULL DEFAULT '[]',
	business_stages_json TEXT NOT NULL DEFAULT '[]',
	founder_tags_json TEXT NOT NULL DEFAULT '[]',
	direct_funding INTEGER NOT NULL DEFAULT 1 CHECK (direct_funding IN (0, 1)),
	canadian_business_eligible INTEGER NOT NULL DEFAULT 1 CHECK (canadian_business_eligible IN (0, 1)),
	last_verified_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_program_url
	ON opportunities(program_url);

CREATE TABLE IF NOT EXISTS opportunity_evidence (
	id TEXT PRIMARY KEY,
	opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
	source_id TEXT NOT NULL REFERENCES source_registry(id),
	source_url TEXT NOT NULL,
	evidence_kind TEXT NOT NULL CHECK (
		evidence_kind IN ('official_page', 'aggregator_listing', 'rss_item', 'manual_seed', 'pdf')
	),
	title TEXT,
	excerpt TEXT,
	artifact_key TEXT,
	content_hash TEXT,
	observed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opportunity_evidence_opportunity
	ON opportunity_evidence(opportunity_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS subscribers (
	id TEXT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL CHECK (status IN ('pending_verification', 'verified', 'unsubscribed')),
	grant_updates_enabled INTEGER NOT NULL DEFAULT 1 CHECK (grant_updates_enabled IN (0, 1)),
	marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK (marketing_consent IN (0, 1)),
	source_label TEXT,
	verification_sent_at TEXT,
	verified_at TEXT,
	unsubscribed_at TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriber_profiles (
	subscriber_id TEXT PRIMARY KEY REFERENCES subscribers(id) ON DELETE CASCADE,
	company_name TEXT,
	provinces_json TEXT NOT NULL DEFAULT '[]',
	industries_json TEXT NOT NULL DEFAULT '[]',
	business_stage TEXT,
	employee_band TEXT,
	annual_revenue_band TEXT,
	funding_needs_json TEXT NOT NULL DEFAULT '[]',
	founder_traits_json TEXT NOT NULL DEFAULT '[]',
	notes TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
	id TEXT PRIMARY KEY,
	subscriber_id TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at TEXT NOT NULL,
	consumed_at TEXT,
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_subscriber
	ON email_verification_tokens(subscriber_id, created_at DESC);

CREATE TABLE IF NOT EXISTS notification_deliveries (
	id TEXT PRIMARY KEY,
	subscriber_id TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
	opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
	delivery_kind TEXT NOT NULL CHECK (delivery_kind IN ('verification', 'grant_update_digest', 'grant_update_alert')),
	delivery_status TEXT NOT NULL CHECK (delivery_status IN ('queued', 'sent', 'failed')),
	provider_message_id TEXT,
	error_message TEXT,
	sent_at TEXT,
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_subscriber_created_at
	ON notification_deliveries(subscriber_id, created_at DESC);

INSERT OR IGNORE INTO source_registry (
	id,
	name,
	kind,
	base_url,
	canonical,
	active,
	crawl_strategy,
	notes,
	created_at,
	updated_at
) VALUES (
	'grantcompass-directory',
	'GrantCompass',
	'aggregator',
	'https://grantcompass.ca/',
	0,
	1,
	'html-directory-discovery',
	'Discovery-only source. Official program pages must override conflicting data.',
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
