import {
	assertCrawlUsageWithinLimits,
	assertSourceCrawlAllowed,
	DEFAULT_CRAWL_LIMITS,
	type CrawlRunLimits,
} from "@/server/ingestion/crawl-policy";
import { logCrawlEvent, type CrawlLogLevel } from "@/server/ingestion/crawl-logging";
import {
	createDefaultCrawlArtifactPersister,
	type CrawlArtifactPersister,
	type PersistFetchedArtifactResult,
} from "@/server/ingestion/artifact-storage";
import {
	createCrawlRun,
	finalizeCrawlRun,
	getCrawlRunById,
	getSourceById,
	type CrawlRunRecord,
	type CrawlSourceRecord,
} from "@/server/ingestion/repository";
import { fetchWithGuards, type SafeFetchResult } from "@/server/ingestion/safe-fetch";
import { assertSafeFetchTarget } from "@/server/ingestion/source-validation";

export type SingleSourceCrawlResult = {
	source: CrawlSourceRecord;
	run: CrawlRunRecord;
	fetch: {
		status: number;
		ok: boolean;
		finalUrl: string;
		redirectChain: string[];
		bytesFetched: number;
		durationMs: number;
		contentType: string | null;
	};
	artifact: PersistFetchedArtifactResult;
	processor?: SingleSourceCrawlProcessorResult;
};

export type SingleSourceCrawlProcessorContext = {
	source: CrawlSourceRecord;
	run: CrawlRunRecord;
	fetchResult: SafeFetchResult;
	artifact: PersistFetchedArtifactResult;
};

export type SingleSourceCrawlProcessorResult = {
	discoveredCount?: number;
	normalizedCount?: number;
	metadata?: Record<string, unknown>;
};

export type RunSingleSourceCrawlOptions = {
	limits?: CrawlRunLimits;
	artifactPersister?: CrawlArtifactPersister;
	processFetchedRun?: (
		context: SingleSourceCrawlProcessorContext
	) => Promise<SingleSourceCrawlProcessorResult | void>;
};

function toErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return "Unknown crawl failure.";
}

async function safeLogCrawlEvent(input: {
	runId: string;
	sourceId: string;
	level: CrawlLogLevel;
	eventType: string;
	message: string;
	metadata?: Record<string, unknown>;
}): Promise<void> {
	try {
		await logCrawlEvent(input);
	} catch (error) {
		console.error("Failed to write crawl event log.", {
			runId: input.runId,
			sourceId: input.sourceId,
			eventType: input.eventType,
			error: toErrorMessage(error),
		});
	}
}

function assertSourceIsCrawlable(source: CrawlSourceRecord): void {
	if (!source.active) {
		throw new Error(`Source ${source.id} is inactive and cannot be crawled.`);
	}

	if (!source.crawlStrategy.trim()) {
		throw new Error(`Source ${source.id} is missing a crawl strategy.`);
	}

	assertSafeFetchTarget(source.baseUrl);
}

function buildFetchMetadata(fetchResult: SafeFetchResult): Record<string, unknown> {
	return {
		...fetchResult.responseMetadata,
	};
}

export async function runSingleSourceCrawl(
	sourceId: string,
	options: RunSingleSourceCrawlOptions = {}
): Promise<SingleSourceCrawlResult> {
	const limits = options.limits ?? DEFAULT_CRAWL_LIMITS;
	const artifactPersister = options.artifactPersister ?? createDefaultCrawlArtifactPersister();
	const source = await getSourceById(sourceId);

	if (!source) {
		throw new Error(`Source ${sourceId} was not found.`);
	}

	assertSourceIsCrawlable(source);
	await assertSourceCrawlAllowed(source.id, limits);

	const run = await createCrawlRun({
		sourceId: source.id,
		status: "running",
	});

	let fetchResult: SafeFetchResult | null = null;

	await safeLogCrawlEvent({
		runId: run.id,
		sourceId: source.id,
		level: "info",
		eventType: "crawl_started",
		message: `Started guarded crawl for ${source.name}`,
		metadata: {
			sourceName: source.name,
			sourceKind: source.kind,
			baseUrl: source.baseUrl,
			crawlStrategy: source.crawlStrategy,
			limits,
		},
	});

	try {
		fetchResult = await fetchWithGuards({
			url: source.baseUrl,
			limits,
		});

		assertCrawlUsageWithinLimits(
			{
				pagesFetched: 1,
				bytesFetched: fetchResult.bytesFetched,
				redirectsFollowed: fetchResult.redirectChain.length,
				durationMs: fetchResult.durationMs,
				llmCalls: 0,
			},
			limits
		);

		await safeLogCrawlEvent({
			runId: run.id,
			sourceId: source.id,
			level: fetchResult.ok ? "info" : "warn",
			eventType: "crawl_response_received",
			message: `Received HTTP ${fetchResult.status} from source fetch`,
			metadata: buildFetchMetadata(fetchResult),
		});

		const artifact = await artifactPersister.persistFetchedArtifact({
			crawlRunId: run.id,
			sourceId: source.id,
			body: fetchResult.body,
			httpStatus: fetchResult.status,
			contentType: fetchResult.contentType,
			finalUrl: fetchResult.finalUrl,
			responseMetadata: fetchResult.responseMetadata,
			fetchedAt: fetchResult.fetchedAt,
		});

		if (artifact.status === "skipped") {
			await safeLogCrawlEvent({
				runId: run.id,
				sourceId: source.id,
				level: "info",
				eventType: "artifact_persistence_skipped",
				message: "Skipped raw artifact persistence for this crawl response",
				metadata: {
					reason: artifact.reason,
					contentType: fetchResult.contentType,
				},
			});
		}

		if (!fetchResult.ok) {
			throw new Error(`Source fetch returned HTTP ${fetchResult.status}.`);
		}

		let processorResult: SingleSourceCrawlProcessorResult | undefined;
		if (options.processFetchedRun) {
			processorResult =
				(await options.processFetchedRun({
					source,
					run,
					fetchResult,
					artifact,
				})) ?? undefined;
		}

		await finalizeCrawlRun({
			runId: run.id,
			status: "succeeded",
			fetchedUrl: fetchResult.finalUrl,
			discoveredCount: processorResult?.discoveredCount ?? 0,
			normalizedCount: processorResult?.normalizedCount ?? 0,
			errorMessage: null,
		});

		await safeLogCrawlEvent({
			runId: run.id,
			sourceId: source.id,
			level: "info",
			eventType: "crawl_completed",
			message: "Crawl run completed successfully",
			metadata: {
				finalUrl: fetchResult.finalUrl,
				status: fetchResult.status,
				bytesFetched: fetchResult.bytesFetched,
				durationMs: fetchResult.durationMs,
				artifactStatus: artifact.status,
				discoveredCount: processorResult?.discoveredCount ?? 0,
				normalizedCount: processorResult?.normalizedCount ?? 0,
				processorMetadata: processorResult?.metadata ?? {},
			},
		});

		const finalizedRun = await getCrawlRunById(run.id);
		if (!finalizedRun) {
			throw new Error(`Crawl run ${run.id} disappeared after completion.`);
		}

		return {
			source,
			run: finalizedRun,
			fetch: {
				status: fetchResult.status,
				ok: fetchResult.ok,
				finalUrl: fetchResult.finalUrl,
				redirectChain: fetchResult.redirectChain,
				bytesFetched: fetchResult.bytesFetched,
				durationMs: fetchResult.durationMs,
				contentType: fetchResult.contentType,
			},
			artifact,
			processor: processorResult,
		};
	} catch (error) {
		const errorMessage = toErrorMessage(error);

		await Promise.allSettled([
			finalizeCrawlRun({
				runId: run.id,
				status: "failed",
				fetchedUrl: fetchResult?.finalUrl ?? null,
				discoveredCount: 0,
				normalizedCount: 0,
				errorMessage,
			}),
		]);
		await safeLogCrawlEvent({
			runId: run.id,
			sourceId: source.id,
			level: "error",
			eventType: "crawl_failed",
			message: errorMessage,
			metadata: {
				finalUrl: fetchResult?.finalUrl ?? null,
				httpStatus: fetchResult?.status ?? null,
				redirectChain: fetchResult?.redirectChain ?? [],
			},
		});

		throw error;
	}
}
