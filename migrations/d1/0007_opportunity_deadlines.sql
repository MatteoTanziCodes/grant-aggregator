PRAGMA foreign_keys = ON;

ALTER TABLE opportunities ADD COLUMN deadline_text TEXT;
ALTER TABLE opportunities ADD COLUMN deadline_at TEXT;
ALTER TABLE opportunities ADD COLUMN deadline_precision TEXT NOT NULL DEFAULT 'unknown' CHECK (
	deadline_precision IN ('exact', 'rolling', 'window', 'unknown')
);
ALTER TABLE opportunities ADD COLUMN deadline_verified INTEGER NOT NULL DEFAULT 0 CHECK (
	deadline_verified IN (0, 1)
);

CREATE INDEX IF NOT EXISTS idx_opportunities_deadline_at
	ON opportunities(deadline_at);
