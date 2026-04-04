import { getFundingDb } from "@/server/cloudflare/context";

export type CrawlLogLevel = "info" | "warn" | "error";

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
