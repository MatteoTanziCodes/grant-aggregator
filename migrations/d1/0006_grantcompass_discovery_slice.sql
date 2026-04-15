PRAGMA foreign_keys = ON;

ALTER TABLE opportunities ADD COLUMN origin_source_id TEXT REFERENCES source_registry(id);
ALTER TABLE opportunities ADD COLUMN truth_tier TEXT NOT NULL DEFAULT 'canonical' CHECK (truth_tier IN ('canonical', 'discovery'));
ALTER TABLE opportunities ADD COLUMN opportunity_origin TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE opportunities ADD COLUMN discovery_key TEXT;

UPDATE opportunities
SET origin_source_id = canonical_source_id
WHERE origin_source_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_origin_source_id
	ON opportunities(origin_source_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_origin_discovery_key
	ON opportunities(origin_source_id, discovery_key)
	WHERE discovery_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS crawl_discovery_candidates (
	id TEXT PRIMARY KEY,
	crawl_run_id TEXT NOT NULL REFERENCES crawl_runs(id) ON DELETE CASCADE,
	source_id TEXT NOT NULL REFERENCES source_registry(id) ON DELETE CASCADE,
	external_key TEXT NOT NULL,
	source_url TEXT NOT NULL,
	title TEXT,
	organization_name TEXT,
	funding_type_text TEXT,
	government_level_text TEXT,
	province_text TEXT,
	amount_text TEXT,
	raw_payload_json TEXT NOT NULL,
	normalized_payload_json TEXT NOT NULL DEFAULT '{}',
	parse_error TEXT,
	upsert_outcome TEXT CHECK (upsert_outcome IN ('created', 'updated', 'skipped', 'parse_failed')),
	opportunity_id TEXT REFERENCES opportunities(id) ON DELETE SET NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE(crawl_run_id, external_key)
);

CREATE INDEX IF NOT EXISTS idx_crawl_discovery_candidates_run
	ON crawl_discovery_candidates(crawl_run_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_discovery_candidates_source
	ON crawl_discovery_candidates(source_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_discovery_candidates_opportunity
	ON crawl_discovery_candidates(opportunity_id, updated_at DESC);

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
	'https://grantcompass.ca/data/grants.json',
	0,
	1,
	'grantcompass-explore-json',
	'Discovery-only aggregator source. Fetches the public explore dataset JSON behind GrantCompass search. Official program pages must override GrantCompass-derived data when canonical sources are added.',
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

UPDATE source_registry
SET
	base_url = 'https://grantcompass.ca/data/grants.json',
	canonical = 0,
	active = 1,
	crawl_strategy = 'grantcompass-explore-json',
	notes = 'Discovery-only aggregator source. Fetches the public explore dataset JSON behind GrantCompass search. Official program pages must override GrantCompass-derived data when canonical sources are added.',
	updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'grantcompass-directory';
