PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crawl_event_logs (
	id TEXT PRIMARY KEY,
	run_id TEXT NOT NULL REFERENCES crawl_runs(id) ON DELETE CASCADE,
	source_id TEXT NOT NULL REFERENCES source_registry(id) ON DELETE CASCADE,
	level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
	event_type TEXT NOT NULL,
	message TEXT NOT NULL,
	metadata_json TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crawl_event_logs_run_created_at
	ON crawl_event_logs(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_event_logs_source_created_at
	ON crawl_event_logs(source_id, created_at DESC);
