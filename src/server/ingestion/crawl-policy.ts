import { getFundingDb } from "@/server/cloudflare/context";

export class CrawlPolicyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "CrawlPolicyError";
	}
}

export type CrawlRunLimits = {
	maxConcurrentRuns: number;
	sourceCooldownMinutes: number;
	maxPagesPerRun: number;
	maxBytesPerRun: number;
	maxRedirects: number;
	maxDurationMs: number;
	maxLlmCallsPerRun: number;
	maxRetriesPerSource: number;
};

export type CrawlRunUsage = {
	pagesFetched: number;
	bytesFetched: number;
	redirectsFollowed: number;
	durationMs: number;
	llmCalls: number;
};

export const DEFAULT_CRAWL_LIMITS: CrawlRunLimits = {
	maxConcurrentRuns: 8,
	sourceCooldownMinutes: 30,
	maxPagesPerRun: 25,
	maxBytesPerRun: 5_000_000,
	maxRedirects: 5,
	maxDurationMs: 45_000,
	maxLlmCallsPerRun: 10,
	maxRetriesPerSource: 3,
};

export async function assertSourceCrawlAllowed(
	sourceId: string,
	limits: CrawlRunLimits = DEFAULT_CRAWL_LIMITS
): Promise<void> {
	const db = await getFundingDb();
	const [runningResult, sourceActiveResult, lastRunResult] = await db.batch([
		db
			.prepare(
				`
					SELECT COUNT(*) AS total
					FROM crawl_runs
					WHERE status IN ('queued', 'running')
				`
			),
		db
			.prepare(
				`
					SELECT COUNT(*) AS total
					FROM crawl_runs
					WHERE source_id = ?
						AND status IN ('queued', 'running')
				`
			)
			.bind(sourceId),
		db
			.prepare(
				`
					SELECT started_at
					FROM crawl_runs
					WHERE source_id = ?
					ORDER BY started_at DESC
					LIMIT 1
				`
			)
			.bind(sourceId),
	]);

	const runningTotal = (runningResult.results[0] as { total?: number } | undefined)?.total ?? 0;
	if (runningTotal >= limits.maxConcurrentRuns) {
		throw new CrawlPolicyError("Global crawl concurrency limit reached.");
	}

	const sourceActiveTotal =
		(sourceActiveResult.results[0] as { total?: number } | undefined)?.total ?? 0;
	if (sourceActiveTotal > 0) {
		throw new CrawlPolicyError("Source already has an active crawl run.");
	}

	const lastStartedAt = (lastRunResult.results[0] as { started_at?: string } | undefined)?.started_at;
	if (lastStartedAt) {
		const cooldownCutoff = Date.now() - limits.sourceCooldownMinutes * 60 * 1000;
		if (Date.parse(lastStartedAt) > cooldownCutoff) {
			throw new CrawlPolicyError("Source is still in cooldown.");
		}
	}
}

export function assertCrawlUsageWithinLimits(
	usage: CrawlRunUsage,
	limits: CrawlRunLimits = DEFAULT_CRAWL_LIMITS
): void {
	if (usage.pagesFetched > limits.maxPagesPerRun) {
		throw new CrawlPolicyError("Page budget exceeded for crawl run.");
	}
	if (usage.bytesFetched > limits.maxBytesPerRun) {
		throw new CrawlPolicyError("Byte budget exceeded for crawl run.");
	}
	if (usage.redirectsFollowed > limits.maxRedirects) {
		throw new CrawlPolicyError("Redirect budget exceeded for crawl run.");
	}
	if (usage.durationMs > limits.maxDurationMs) {
		throw new CrawlPolicyError("Duration budget exceeded for crawl run.");
	}
	if (usage.llmCalls > limits.maxLlmCallsPerRun) {
		throw new CrawlPolicyError("LLM call budget exceeded for crawl run.");
	}
}
