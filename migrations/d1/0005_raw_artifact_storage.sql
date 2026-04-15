PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crawl_artifacts (
	id TEXT PRIMARY KEY,
	crawl_run_id TEXT NOT NULL REFERENCES crawl_runs(id) ON DELETE CASCADE,
	source_id TEXT NOT NULL REFERENCES source_registry(id) ON DELETE CASCADE,
	artifact_type TEXT NOT NULL CHECK (artifact_type IN ('html', 'markdown', 'json', 'text')),
	storage_key TEXT NOT NULL UNIQUE,
	content_hash TEXT NOT NULL,
	http_status INTEGER,
	content_type TEXT,
	final_url TEXT NOT NULL,
	response_metadata_json TEXT NOT NULL DEFAULT '{}',
	fetched_at TEXT NOT NULL,
	size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crawl_artifacts_run_fetched_at
	ON crawl_artifacts(crawl_run_id, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_artifacts_source_fetched_at
	ON crawl_artifacts(source_id, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_artifacts_content_hash
	ON crawl_artifacts(content_hash);
