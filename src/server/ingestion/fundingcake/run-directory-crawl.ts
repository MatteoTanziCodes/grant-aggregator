import {
	createDefaultCrawlArtifactPersister,
	listCrawlArtifactsForRun,
} from "@/server/ingestion/artifact-storage";
import { getFundingDb } from "@/server/cloudflare/context";
import { listCrawlEventsForRun, logCrawlEvent } from "@/server/ingestion/crawl-logging";
import {
	FUNDINGCAKE_OPPORTUNITY_ORIGIN,
	FUNDINGCAKE_SOURCE_ID,
	FUNDINGCAKE_SOURCE_URL,
} from "@/server/ingestion/fundingcake/constants";
import {
	extractFundingCakePaginationUrls,
	parseFundingCakeDetailArtifact,
	parseFundingCakeDirectoryArtifact,
	type FundingCakeDetailCandidate,
	type FundingCakeExtractedCandidate,
} from "@/server/ingestion/fundingcake/parser";
import {
	type DiscoveryNormalizedCandidate,
	getRunCandidateSummary,
	upsertDiscoveryOpportunity,
	writeDiscoveryCandidateObservation,
} from "@/server/ingestion/grantcompass/repository";
import {
	assertCrawlUsageWithinLimits,
	assertSourceCrawlAllowed,
	DEFAULT_CRAWL_LIMITS,
	type CrawlRunLimits,
} from "@/server/ingestion/crawl-policy";
import {
	createCrawlRun,
	finalizeCrawlRun,
	getCrawlRunById,
	getLatestCrawlRunForSource,
	getSourceById,
	type CrawlSourceRecord,
} from "@/server/ingestion/repository";
import { fetchWithGuards } from "@/server/ingestion/safe-fetch";
import { assertSafeFetchTarget } from "@/server/ingestion/source-validation";

type FundingCakeRunSummary = {
	pageCount: number;
	detailPageCount: number;
	extractedCount: number;
	parseFailureCount: number;
	createdCount: number;
	updatedCount: number;
};

const FUNDINGCAKE_CRAWL_LIMITS: CrawlRunLimits = {
	...DEFAULT_CRAWL_LIMITS,
	maxPagesPerRun: 80,
	maxBytesPerRun: 40_000_000,
	maxDurationMs: 120_000,
};

function nowIso(): string {
	return new Date().toISOString();
}

function decodeArtifactText(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	return "Unknown FundingCake ingestion error.";
}

function mapFundingCakeCategory(
	categoryText: string
): DiscoveryNormalizedCandidate["fundingCategory"] {
	const normalized = categoryText.trim().toLowerCase();
	if (normalized.includes("competition")) {
		return "pitch_competition";
	}
	if (normalized.includes("accelerator")) {
		return "accelerator_funding";
	}
	if (normalized.includes("incubator")) {
		return "incubator_funding";
	}
	if (normalized.includes("loan")) {
		return "loan";
	}
	if (normalized.includes("equity")) {
		return "equity_program";
	}

	return "grant";
}

function normalizeAmountRange(amountText: string | null): {
	amountMinCad: number | null;
	amountMaxCad: number | null;
} {
	const normalized = amountText?.replace(/,/g, "").replace(/\s+/g, " ").trim() ?? "";
	if (!normalized) {
		return { amountMinCad: null, amountMaxCad: null };
	}

	const matches = Array.from(normalized.matchAll(/\$?(\d+(?:\.\d+)?)\s*([KMB])?/gi));
	if (matches.length === 0) {
		return { amountMinCad: null, amountMaxCad: null };
	}

	const values = matches
		.map((match) => {
			const base = Number.parseFloat(match[1] ?? "");
			const suffix = match[2]?.toUpperCase();
			if (!Number.isFinite(base)) {
				return null;
			}
			switch (suffix) {
				case "K":
					return Math.round(base * 1_000);
				case "M":
					return Math.round(base * 1_000_000);
				case "B":
					return Math.round(base * 1_000_000_000);
				default:
					return Math.round(base);
			}
		})
		.filter((value): value is number => value !== null);

	if (values.length === 0) {
		return { amountMinCad: null, amountMaxCad: null };
	}

	if (/^up to\b/i.test(normalized)) {
		return { amountMinCad: null, amountMaxCad: values[0] ?? null };
	}

	return {
		amountMinCad: values[0] ?? null,
		amountMaxCad: values[1] ?? values[0] ?? null,
	};
}

function normalizeCandidate(
	candidate: FundingCakeExtractedCandidate,
	detail: FundingCakeDetailCandidate
): DiscoveryNormalizedCandidate {
	const fundingCategory = mapFundingCakeCategory(detail.categoryText || candidate.categoryText);
	const { amountMinCad, amountMaxCad } = normalizeAmountRange(detail.amountText);

	return {
		externalKey: candidate.externalKey,
		sourceUrl: candidate.sourceUrl,
		title: detail.title || candidate.title,
		organizationName: detail.organizationName ?? "Unknown organization",
		amountText: detail.amountText ?? "Unknown",
		amountMinCad,
		amountMaxCad,
		deadlineText: detail.deadlineText,
		deadlineAt: null,
		deadlinePrecision: detail.deadlineText ? "window" : "unknown",
		deadlineVerified: false,
		fundingTypeText: detail.categoryText || candidate.categoryText,
		governmentLevelText: "Unknown",
		provinceText: detail.locationText || candidate.locationText,
		provinceCodes: detail.provinceCodes.length > 0 ? detail.provinceCodes : candidate.provinceCodes,
		programUrl: detail.officialProgramUrl ?? candidate.sourceUrl,
		fundingCategory,
		summary: detail.summary,
		recordStatus: "active",
		truthTier: "discovery",
		opportunityOrigin: FUNDINGCAKE_OPPORTUNITY_ORIGIN,
		directFunding: fundingCategory !== "accelerator_funding" && fundingCategory !== "incubator_funding",
		canadianBusinessEligible: true,
		industryTags: [],
		businessStages: [],
		founderTags: [],
		programStatusText: null,
		normalizedPayload: {
			externalKey: candidate.externalKey,
			listingId: candidate.listingId,
			sourceUrl: candidate.sourceUrl,
			title: detail.title || candidate.title,
			categoryText: detail.categoryText || candidate.categoryText,
			locationText: detail.locationText || candidate.locationText,
			provinceCodes: detail.provinceCodes.length > 0 ? detail.provinceCodes : candidate.provinceCodes,
			amountText: detail.amountText,
			amountMinCad,
			amountMaxCad,
			deadlineText: detail.deadlineText,
			officialProgramUrl: detail.officialProgramUrl,
			summary: detail.summary,
			organizationName: detail.organizationName,
			fundingCategory,
			truthTier: "discovery",
			opportunityOrigin: FUNDINGCAKE_OPPORTUNITY_ORIGIN,
		},
	};
}

async function ensureFundingCakeSourceRecord(): Promise<void> {
	const dbSource = await getSourceById(FUNDINGCAKE_SOURCE_ID);
	const timestamp = nowIso();

	if (dbSource) {
		const db = await getFundingDb();
		await db
			.prepare(
				`
					UPDATE source_registry
					SET
						name = ?,
						kind = 'aggregator',
						base_url = ?,
						canonical = 0,
						active = 1,
						crawl_strategy = ?,
						notes = ?,
						updated_at = ?
					WHERE id = ?
				`
			)
			.bind(
				"FundingCake",
				FUNDINGCAKE_SOURCE_URL,
				"fundingcake-directory-html",
				"Discovery-only aggregator source. Parses the public FundingCake directory and keeps only Canada and Global listings from the public cards.",
				timestamp,
				FUNDINGCAKE_SOURCE_ID
			)
			.run();
		return;
	}

	const db = await getFundingDb();
	await db
		.prepare(
			`
				INSERT INTO source_registry (
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
				)
				VALUES (?, ?, 'aggregator', ?, 0, 1, ?, ?, ?, ?)
			`
		)
		.bind(
			FUNDINGCAKE_SOURCE_ID,
			"FundingCake",
			FUNDINGCAKE_SOURCE_URL,
			"fundingcake-directory-html",
			"Discovery-only aggregator source. Parses the public FundingCake directory and keeps only Canada and Global listings from the public cards.",
			timestamp,
			timestamp
		)
		.run();
}

function assertSourceIsCrawlable(source: CrawlSourceRecord): void {
	if (!source.active) {
		throw new Error(`Source ${source.id} is inactive and cannot be crawled.`);
	}

	assertSafeFetchTarget(source.baseUrl);
}

export async function runFundingCakeDirectoryCrawl(limits: CrawlRunLimits = FUNDINGCAKE_CRAWL_LIMITS) {
	await ensureFundingCakeSourceRecord();
	const source = await getSourceById(FUNDINGCAKE_SOURCE_ID);
	if (!source) {
		throw new Error("FundingCake source record was not found.");
	}

	assertSourceIsCrawlable(source);
	await assertSourceCrawlAllowed(source.id, limits);

	const run = await createCrawlRun({
		sourceId: source.id,
		status: "running",
	});
	const artifactPersister = createDefaultCrawlArtifactPersister();
	let lastFetchUrl: string | null = null;

	try {
		await logCrawlEvent({
			runId: run.id,
			sourceId: source.id,
			level: "info",
			eventType: "crawl_started",
			message: `Started paginated crawl for ${source.name}`,
			metadata: {
				baseUrl: source.baseUrl,
				crawlStrategy: source.crawlStrategy,
				limits,
			},
		});

		const initialFetch = await fetchWithGuards({ url: source.baseUrl, limits });
		lastFetchUrl = initialFetch.finalUrl;

		const artifact = await artifactPersister.persistFetchedArtifact({
			crawlRunId: run.id,
			sourceId: source.id,
			body: initialFetch.body,
			httpStatus: initialFetch.status,
			contentType: initialFetch.contentType,
			finalUrl: initialFetch.finalUrl,
			responseMetadata: initialFetch.responseMetadata,
			fetchedAt: initialFetch.fetchedAt,
		});

		if (!initialFetch.ok) {
			throw new Error(`FundingCake source fetch returned HTTP ${initialFetch.status}.`);
		}

		const allPageUrls = [initialFetch.finalUrl, ...extractFundingCakePaginationUrls(decodeArtifactText(initialFetch.body))];
		const pageUrls = [...new Set(allPageUrls)];
		let totalBytesFetched = initialFetch.bytesFetched;
		let totalRedirects = initialFetch.redirectChain.length;
		let totalDurationMs = initialFetch.durationMs;

		const extractedByKey = new Map<string, FundingCakeExtractedCandidate>();
		for (const [pageIndex, pageUrl] of pageUrls.entries()) {
			let pageBody = initialFetch.body;
			let fetchedAt = initialFetch.fetchedAt;

			if (pageIndex > 0) {
				const pageFetch = await fetchWithGuards({ url: pageUrl, limits });
				lastFetchUrl = pageFetch.finalUrl;
				if (!pageFetch.ok) {
					throw new Error(`FundingCake pagination fetch returned HTTP ${pageFetch.status} for ${pageUrl}.`);
				}
				pageBody = pageFetch.body;
				fetchedAt = pageFetch.fetchedAt;
				totalBytesFetched += pageFetch.bytesFetched;
				totalRedirects += pageFetch.redirectChain.length;
				totalDurationMs += pageFetch.durationMs;
			}

			await logCrawlEvent({
				runId: run.id,
				sourceId: source.id,
				level: "info",
				eventType: "fundingcake_page_parsed",
				message: `Parsed FundingCake page ${pageIndex + 1} of ${pageUrls.length}`,
				metadata: {
					pageUrl,
					pageIndex: pageIndex + 1,
					pageCount: pageUrls.length,
					fetchedAt,
				},
			});

			for (const candidate of await parseFundingCakeDirectoryArtifact(decodeArtifactText(pageBody))) {
				extractedByKey.set(candidate.externalKey, candidate);
			}

			assertCrawlUsageWithinLimits(
				{
					pagesFetched: pageIndex + 1,
					bytesFetched: totalBytesFetched,
					redirectsFollowed: totalRedirects,
					durationMs: totalDurationMs,
					llmCalls: 0,
				},
				limits
			);
		}

		const artifactKey = artifact.status === "stored" ? artifact.artifact.storageKey : null;
		const contentHash = artifact.status === "stored" ? artifact.artifact.contentHash : null;
		let parseFailureCount = 0;
		let createdCount = 0;
		let updatedCount = 0;
		const extractedCandidates = [...extractedByKey.values()];
		let detailPageCount = 0;

		for (const candidate of extractedCandidates) {
			try {
				const detailFetch = await fetchWithGuards({ url: candidate.sourceUrl, limits });
				lastFetchUrl = detailFetch.finalUrl;
				if (!detailFetch.ok) {
					throw new Error(
						`FundingCake detail fetch returned HTTP ${detailFetch.status} for ${candidate.sourceUrl}.`
					);
				}
				totalBytesFetched += detailFetch.bytesFetched;
				totalRedirects += detailFetch.redirectChain.length;
				totalDurationMs += detailFetch.durationMs;
				detailPageCount += 1;
				assertCrawlUsageWithinLimits(
					{
						pagesFetched: pageUrls.length + detailPageCount,
						bytesFetched: totalBytesFetched,
						redirectsFollowed: totalRedirects,
						durationMs: totalDurationMs,
						llmCalls: 0,
					},
					limits
				);

				const detail = await parseFundingCakeDetailArtifact(decodeArtifactText(detailFetch.body));
				const normalized = normalizeCandidate(candidate, detail);
				const upsertResult = await upsertDiscoveryOpportunity({
					sourceId: source.id,
					candidate: normalized,
					artifactKey,
					contentHash,
					observedAt: initialFetch.fetchedAt,
				});

				if (upsertResult.outcome === "created") {
					createdCount += 1;
				} else {
					updatedCount += 1;
				}

				await writeDiscoveryCandidateObservation({
					crawlRunId: run.id,
					sourceId: source.id,
					externalKey: candidate.externalKey,
					sourceUrl: candidate.sourceUrl,
					title: normalized.title,
					organizationName: normalized.organizationName,
					fundingTypeText: normalized.fundingTypeText,
					governmentLevelText: "Unknown",
					provinceText: normalized.provinceText,
					amountText: normalized.amountText,
					rawPayload: {
						...candidate.rawPayload,
						...detail.rawPayload,
					},
					normalizedPayload: normalized.normalizedPayload,
					parseError: null,
					upsertOutcome: upsertResult.outcome,
					opportunityId: upsertResult.opportunityId,
				});
			} catch (error) {
				parseFailureCount += 1;
				await writeDiscoveryCandidateObservation({
					crawlRunId: run.id,
					sourceId: source.id,
					externalKey: candidate.externalKey,
					sourceUrl: candidate.sourceUrl,
					title: candidate.title,
					organizationName: null,
					fundingTypeText: candidate.categoryText,
					governmentLevelText: "Unknown",
					provinceText: candidate.locationText,
					amountText: null,
					rawPayload: candidate.rawPayload,
					normalizedPayload: {},
					parseError: toErrorMessage(error),
					upsertOutcome: "parse_failed",
					opportunityId: null,
				});
			}
		}

		const summary: FundingCakeRunSummary = {
			pageCount: pageUrls.length,
			detailPageCount,
			extractedCount: extractedCandidates.length,
			parseFailureCount,
			createdCount,
			updatedCount,
		};

		await finalizeCrawlRun({
			runId: run.id,
			status: "succeeded",
			fetchedUrl: initialFetch.finalUrl,
			discoveredCount: summary.extractedCount,
			normalizedCount: summary.createdCount + summary.updatedCount,
			errorMessage: null,
		});

		await logCrawlEvent({
			runId: run.id,
			sourceId: source.id,
			level: parseFailureCount > 0 ? "warn" : "info",
			eventType: "crawl_completed",
			message: "FundingCake discovery crawl completed",
			metadata: summary,
		});

		const finalizedRun = await getCrawlRunById(run.id);
		if (!finalizedRun) {
			throw new Error(`FundingCake crawl run ${run.id} disappeared after completion.`);
		}

		return {
			source,
			run: finalizedRun,
			artifact,
			summary,
		};
	} catch (error) {
		const errorMessage = toErrorMessage(error);
		await finalizeCrawlRun({
			runId: run.id,
			status: "failed",
			fetchedUrl: lastFetchUrl,
			discoveredCount: 0,
			normalizedCount: 0,
			errorMessage,
		});
		await logCrawlEvent({
			runId: run.id,
			sourceId: source.id,
			level: "error",
			eventType: "crawl_failed",
			message: errorMessage,
			metadata: {
				finalUrl: lastFetchUrl,
			},
		});
		throw error;
	}
}

export async function getFundingCakeLatestAdminSnapshot() {
	await ensureFundingCakeSourceRecord();
	const source = await getSourceById(FUNDINGCAKE_SOURCE_ID);
	if (!source) {
		throw new Error("FundingCake source record was not found.");
	}

	const latestRun = await getLatestCrawlRunForSource(source.id);
	if (!latestRun) {
		return {
			source,
			latestRun: null,
			latestArtifact: null,
			candidateSummary: null,
			events: [],
			description: "Paginated HTML crawl of the public FundingCake directory. Only Canada and Global cards are retained as discovery-tier opportunities.",
		};
	}

	const [latestArtifact, candidateSummary, events] = await Promise.all([
		listCrawlArtifactsForRun(latestRun.id).then((items) => items[0] ?? null),
		getRunCandidateSummary(latestRun.id),
		listCrawlEventsForRun(latestRun.id, 25),
	]);

	return {
		source,
		latestRun,
		latestArtifact,
		candidateSummary,
		events,
		description:
			"Paginated HTML crawl of the public FundingCake directory. Only Canada and Global cards are retained as discovery-tier opportunities.",
	};
}
