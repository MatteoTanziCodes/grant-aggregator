import { getFundingDb } from "@/server/cloudflare/context";

export type CrawlLogLevel = "info" | "warn" | "error";

export type CrawlEventLogRecord = {
	id: string;
	runId: string;
	sourceId: string;
	level: CrawlLogLevel;
	eventType: string;
	message: string;
	metadata: Record<string, unknown>;
	createdAt: string;
};

type CrawlEventLogRow = {
	id: string;
	run_id: string;
	source_id: string;
	level: CrawlLogLevel;
	event_type: string;
	message: string;
	metadata_json: string;
	created_at: string;
};

function nowIso(): string {
	return new Date().toISOString();
}

export async function logCrawlEvent(input: {
	runId: string;
	sourceId: string;
	level: CrawlLogLevel;
	eventType: string;
	message: string;
	metadata?: Record<string, unknown>;
}): Promise<void> {
	const db = await getFundingDb();

	await db
		.prepare(
			`
				INSERT INTO crawl_event_logs (
					id,
					run_id,
					source_id,
					level,
					event_type,
					message,
					metadata_json,
					created_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`
		)
		.bind(
			crypto.randomUUID(),
			input.runId,
			input.sourceId,
			input.level,
			input.eventType,
			input.message,
			JSON.stringify(input.metadata ?? {}),
			nowIso()
		)
		.run();
}

function mapCrawlEventLogRow(row: CrawlEventLogRow): CrawlEventLogRecord {
	return {
		id: row.id,
		runId: row.run_id,
		sourceId: row.source_id,
		level: row.level,
		eventType: row.event_type,
		message: row.message,
		metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
		createdAt: row.created_at,
	};
}

export async function listCrawlEventsForRun(runId: string, limit = 50): Promise<CrawlEventLogRecord[]> {
	const db = await getFundingDb();
	const boundedLimit = Math.min(Math.max(limit, 1), 200);
	const result = await db
		.prepare(
			`
				SELECT
					id,
					run_id,
					source_id,
					level,
					event_type,
					message,
					metadata_json,
					created_at
				FROM crawl_event_logs
				WHERE run_id = ?
				ORDER BY created_at DESC
				LIMIT ?
			`
		)
		.bind(runId, boundedLimit)
		.all<CrawlEventLogRow>();

	return result.results.map((row) => mapCrawlEventLogRow(row as unknown as CrawlEventLogRow));
}
