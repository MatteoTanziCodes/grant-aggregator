import { getFundingDb } from "@/server/cloudflare/context";

export type CrawlSourceKind = "official" | "aggregator" | "rss" | "institutional";
export type CrawlRunStatus = "queued" | "running" | "succeeded" | "failed";

export type CrawlSourceRecord = {
	id: string;
	name: string;
	kind: CrawlSourceKind;
	baseUrl: string;
	canonical: boolean;
	active: boolean;
	crawlStrategy: string;
	notes: string | null;
	createdAt: string;
	updatedAt: string;
};

export type CrawlRunRecord = {
	id: string;
	sourceId: string;
	status: CrawlRunStatus;
	fetchedUrl: string | null;
	artifactKey: string | null;
	contentHash: string | null;
	discoveredCount: number;
	normalizedCount: number;
	errorMessage: string | null;
	startedAt: string;
	finishedAt: string | null;
};

type CrawlSourceRow = {
	id: string;
	name: string;
	kind: CrawlSourceKind;
	base_url: string;
	canonical: number;
	active: number;
	crawl_strategy: string;
	notes: string | null;
	created_at: string;
	updated_at: string;
};

type CrawlRunRow = {
	id: string;
	source_id: string;
	status: CrawlRunStatus;
	fetched_url: string | null;
	artifact_key: string | null;
	content_hash: string | null;
	discovered_count: number;
	normalized_count: number;
	error_message: string | null;
	started_at: string;
	finished_at: string | null;
};

function nowIso(): string {
	return new Date().toISOString();
}

function mapSourceRow(row: CrawlSourceRow): CrawlSourceRecord {
	return {
		id: row.id,
		name: row.name,
		kind: row.kind,
		baseUrl: row.base_url,
		canonical: row.canonical === 1,
		active: row.active === 1,
		crawlStrategy: row.crawl_strategy,
		notes: row.notes,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapCrawlRunRow(row: CrawlRunRow): CrawlRunRecord {
	return {
		id: row.id,
		sourceId: row.source_id,
		status: row.status,
		fetchedUrl: row.fetched_url,
		artifactKey: row.artifact_key,
		contentHash: row.content_hash,
		discoveredCount: row.discovered_count,
		normalizedCount: row.normalized_count,
		errorMessage: row.error_message,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
	};
}

export async function getSourceById(sourceId: string): Promise<CrawlSourceRecord | null> {
	const db = await getFundingDb();
	const row = await db
		.prepare(
			`
				SELECT
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
				FROM source_registry
				WHERE id = ?
			`
		)
		.bind(sourceId)
		.first<CrawlSourceRow>();

	return row ? mapSourceRow(row) : null;
}

export async function createCrawlRun(input: {
	sourceId: string;
	status?: Extract<CrawlRunStatus, "queued" | "running">;
	startedAt?: string;
}): Promise<CrawlRunRecord> {
	const db = await getFundingDb();
	const runId = crypto.randomUUID();
	const startedAt = input.startedAt ?? nowIso();
	const status = input.status ?? "running";

	await db
		.prepare(
			`
				INSERT INTO crawl_runs (
					id,
					source_id,
					status,
					started_at
				)
				VALUES (?, ?, ?, ?)
			`
		)
		.bind(runId, input.sourceId, status, startedAt)
		.run();

	return {
		id: runId,
		sourceId: input.sourceId,
		status,
		fetchedUrl: null,
		artifactKey: null,
		contentHash: null,
		discoveredCount: 0,
		normalizedCount: 0,
		errorMessage: null,
		startedAt,
		finishedAt: null,
	};
}

export async function finalizeCrawlRun(input: {
	runId: string;
	status: Extract<CrawlRunStatus, "succeeded" | "failed">;
	fetchedUrl?: string | null;
	errorMessage?: string | null;
	discoveredCount?: number;
	normalizedCount?: number;
	finishedAt?: string;
}): Promise<void> {
	const db = await getFundingDb();

	await db
		.prepare(
			`
				UPDATE crawl_runs
				SET
					status = ?,
					fetched_url = ?,
					discovered_count = ?,
					normalized_count = ?,
					error_message = ?,
					finished_at = ?
				WHERE id = ?
			`
		)
		.bind(
			input.status,
			input.fetchedUrl ?? null,
			input.discoveredCount ?? 0,
			input.normalizedCount ?? 0,
			input.errorMessage ?? null,
			input.finishedAt ?? nowIso(),
			input.runId
		)
		.run();
}

export async function getCrawlRunById(runId: string): Promise<CrawlRunRecord | null> {
	const db = await getFundingDb();
	const row = await db
		.prepare(
			`
				SELECT
					id,
					source_id,
					status,
					fetched_url,
					artifact_key,
					content_hash,
					discovered_count,
					normalized_count,
					error_message,
					started_at,
					finished_at
				FROM crawl_runs
				WHERE id = ?
			`
		)
		.bind(runId)
		.first<CrawlRunRow>();

	return row ? mapCrawlRunRow(row) : null;
}

export async function getLatestCrawlRunForSource(sourceId: string): Promise<CrawlRunRecord | null> {
	const db = await getFundingDb();
	const row = await db
		.prepare(
			`
				SELECT
					id,
					source_id,
					status,
					fetched_url,
					artifact_key,
					content_hash,
					discovered_count,
					normalized_count,
					error_message,
					started_at,
					finished_at
				FROM crawl_runs
				WHERE source_id = ?
				ORDER BY started_at DESC
				LIMIT 1
			`
		)
		.bind(sourceId)
		.first<CrawlRunRow>();

	return row ? mapCrawlRunRow(row) : null;
}
