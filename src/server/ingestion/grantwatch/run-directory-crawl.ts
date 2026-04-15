import {
	createDefaultCrawlArtifactPersister,
	listCrawlArtifactsForRun,
} from "@/server/ingestion/artifact-storage";
import { getFundingDb } from "@/server/cloudflare/context";
import { validateOfficialGrantPage } from "@/server/ingestion/discovery-validation";
import { listCrawlEventsForRun, logCrawlEvent } from "@/server/ingestion/crawl-logging";
import {
	GRANTWATCH_CANADA_REGION_JSON,
	GRANTWATCH_OPPORTUNITY_ORIGIN,
	GRANTWATCH_SOURCE_ID,
	GRANTWATCH_SOURCE_URL,
} from "@/server/ingestion/grantwatch/constants";
import {
	parseGrantWatchDetailArtifact,
	parseGrantWatchSearchPage,
	type GrantWatchSearchCandidate,
} from "@/server/ingestion/grantwatch/parser";
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

type GrantWatchRunSummary = {
	searchPageCount: number;
	detailPageCount: number;
	validationCount: number;
	extractedCount: number;
	parseFailureCount: number;
	createdCount: number;
	updatedCount: number;
};

const GRANTWATCH_CRAWL_LIMITS: CrawlRunLimits = {
	...DEFAULT_CRAWL_LIMITS,
	maxPagesPerRun: 90,
	maxBytesPerRun: 45_000_000,
	maxDurationMs: 180_000,
};
const GRANTWATCH_MAX_SEARCH_PAGES = 5;

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

	return "Unknown GrantWatch ingestion error.";
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

	return {
		amountMinCad: values[0] ?? null,
		amountMaxCad: values[1] ?? values[0] ?? null,
	};
}

function mapGrantWatchCategory(
	fundingTypeText: string
): DiscoveryNormalizedCandidate["fundingCategory"] {
	const normalized = fundingTypeText.toLowerCase();
	if (normalized.includes("loan guarantee")) {
		return "loan_guarantee";
	}
	if (normalized.includes("loan")) {
		return "loan";
	}
	if (normalized.includes("tax credit") || normalized.includes("rebate")) {
		return "non_repayable_contribution";
	}
	if (normalized.includes("award") || normalized.includes("competition") || normalized.includes("prize")) {
		return "pitch_competition";
	}
	return "grant";
}

function normalizeCandidate(
	searchCandidate: GrantWatchSearchCandidate,
	detail: ReturnType<typeof parseGrantWatchDetailArtifact>,
	validatedProgramUrl: string
): DiscoveryNormalizedCandidate {
	const fundingCategory = mapGrantWatchCategory(detail.fundingTypeText);
	const { amountMinCad, amountMaxCad } = normalizeAmountRange(detail.amountText);

	return {
		externalKey: searchCandidate.externalKey,
		sourceUrl: searchCandidate.sourceUrl,
		title: detail.title,
		organizationName: detail.organizationName,
		amountText: detail.amountText,
		amountMinCad,
		amountMaxCad,
		deadlineText: detail.deadlineText ?? searchCandidate.deadlineText,
		deadlineAt: detail.deadlineAt,
		deadlinePrecision: detail.deadlineAt ? "exact" : detail.deadlineText ? "window" : "unknown",
		deadlineVerified: detail.deadlineAt !== null,
		fundingTypeText: detail.fundingTypeText,
		governmentLevelText: detail.governmentLevelText,
		provinceText: detail.provinceText,
		provinceCodes: detail.provinceCodes,
		programUrl: validatedProgramUrl,
		fundingCategory,
		summary: detail.summary ?? searchCandidate.summary,
		recordStatus: detail.recordStatus,
		truthTier: "discovery",
		opportunityOrigin: GRANTWATCH_OPPORTUNITY_ORIGIN,
		directFunding: fundingCategory !== "pitch_competition",
		canadianBusinessEligible: true,
		industryTags: [],
		businessStages: [],
		founderTags: [],
		programStatusText: null,
		normalizedPayload: {
			grantId: detail.grantId,
			sourceUrl: searchCandidate.sourceUrl,
			title: detail.title,
			organizationName: detail.organizationName,
			amountText: detail.amountText,
			amountMinCad,
			amountMaxCad,
			deadlineText: detail.deadlineText ?? searchCandidate.deadlineText,
			deadlineAt: detail.deadlineAt,
			fundingTypeText: detail.fundingTypeText,
			governmentLevelText: detail.governmentLevelText,
			provinceText: detail.provinceText,
			provinceCodes: detail.provinceCodes,
			officialProgramUrl: validatedProgramUrl,
			summary: detail.summary ?? searchCandidate.summary,
			fundingCategory,
			truthTier: "discovery",
			opportunityOrigin: GRANTWATCH_OPPORTUNITY_ORIGIN,
		},
	};
}

async function ensureGrantWatchSourceRecord(): Promise<void> {
	const db = await getFundingDb();
	const timestamp = nowIso();

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
				ON CONFLICT(id) DO UPDATE SET
					name = excluded.name,
					kind = excluded.kind,
					base_url = excluded.base_url,
					canonical = excluded.canonical,
					active = excluded.active,
					crawl_strategy = excluded.crawl_strategy,
					notes = excluded.notes,
					updated_at = excluded.updated_at
			`
		)
		.bind(
			GRANTWATCH_SOURCE_ID,
			"GrantWatch Canada",
			GRANTWATCH_SOURCE_URL,
			"grantwatch-canada-post-search-html",
			"Discovery-only aggregator source. Crawls the Canada GrantWatch search flow and retains only Canada-relevant entries whose embedded official link resolves to an accessible grant-like page.",
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

async function fetchGrantWatchSearchPage(page: number, limits: CrawlRunLimits) {
	const body = new URLSearchParams({
		page: String(page),
		"regions[]": GRANTWATCH_CANADA_REGION_JSON,
	}).toString();

	return fetchWithGuards({
		url: GRANTWATCH_SOURCE_URL,
		limits,
		method: "POST",
		headers: {
			"content-type": "application/x-www-form-urlencoded; charset=UTF-8",
			referer: GRANTWATCH_SOURCE_URL,
		},
		body,
	});
}

export async function runGrantWatchDirectoryCrawl(
	limits: CrawlRunLimits = GRANTWATCH_CRAWL_LIMITS
) {
	await ensureGrantWatchSourceRecord();
	const source = await getSourceById(GRANTWATCH_SOURCE_ID);
	if (!source) {
		throw new Error("GrantWatch source record was not found.");
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
			message: `Started Canada-only crawl for ${source.name}`,
			metadata: {
				baseUrl: source.baseUrl,
				crawlStrategy: source.crawlStrategy,
				limits,
			},
		});

		const firstSearchFetch = await fetchGrantWatchSearchPage(1, limits);
		lastFetchUrl = firstSearchFetch.finalUrl;
		const artifact = await artifactPersister.persistFetchedArtifact({
			crawlRunId: run.id,
			sourceId: source.id,
			body: firstSearchFetch.body,
			httpStatus: firstSearchFetch.status,
			contentType: firstSearchFetch.contentType,
			finalUrl: firstSearchFetch.finalUrl,
			responseMetadata: firstSearchFetch.responseMetadata,
			fetchedAt: firstSearchFetch.fetchedAt,
		});

		if (!firstSearchFetch.ok) {
			throw new Error(`GrantWatch search page returned HTTP ${firstSearchFetch.status}.`);
		}

		let totalBytesFetched = firstSearchFetch.bytesFetched;
		let totalRedirects = firstSearchFetch.redirectChain.length;
		let totalDurationMs = firstSearchFetch.durationMs;
		let searchPageCount = 0;
		const searchCandidatesByKey = new Map<string, GrantWatchSearchCandidate>();

		for (let page = 1; page <= GRANTWATCH_MAX_SEARCH_PAGES; page += 1) {
			const searchFetch = page === 1 ? firstSearchFetch : await fetchGrantWatchSearchPage(page, limits);
			lastFetchUrl = searchFetch.finalUrl;
			if (!searchFetch.ok) {
				throw new Error(`GrantWatch search page ${page} returned HTTP ${searchFetch.status}.`);
			}
			if (page > 1) {
				totalBytesFetched += searchFetch.bytesFetched;
				totalRedirects += searchFetch.redirectChain.length;
				totalDurationMs += searchFetch.durationMs;
			}
			searchPageCount = page;

			const pageCandidates = parseGrantWatchSearchPage(decodeArtifactText(searchFetch.body));
			let newCandidateCount = 0;
			for (const candidate of pageCandidates) {
				if (!searchCandidatesByKey.has(candidate.externalKey)) {
					searchCandidatesByKey.set(candidate.externalKey, candidate);
					newCandidateCount += 1;
				}
			}

			await logCrawlEvent({
				runId: run.id,
				sourceId: source.id,
				level: "info",
				eventType: "grantwatch_page_parsed",
				message: `Parsed GrantWatch search page ${page}`,
				metadata: {
					page,
					candidateCount: pageCandidates.length,
					newCandidateCount,
				},
			});

			assertCrawlUsageWithinLimits(
				{
					pagesFetched: page,
					bytesFetched: totalBytesFetched,
					redirectsFollowed: totalRedirects,
					durationMs: totalDurationMs,
					llmCalls: 0,
				},
				limits
			);

			if (newCandidateCount === 0) {
				break;
			}
		}

		const artifactKey = artifact.status === "stored" ? artifact.artifact.storageKey : null;
		const contentHash = artifact.status === "stored" ? artifact.artifact.contentHash : null;
		const searchCandidates = [...searchCandidatesByKey.values()];
		let detailPageCount = 0;
		let validationCount = 0;
		let parseFailureCount = 0;
		let createdCount = 0;
		let updatedCount = 0;

		for (const candidate of searchCandidates) {
			try {
				const detailFetch = await fetchWithGuards({ url: candidate.sourceUrl, limits });
				lastFetchUrl = detailFetch.finalUrl;
				if (!detailFetch.ok) {
					throw new Error(
						`GrantWatch detail fetch returned HTTP ${detailFetch.status} for ${candidate.sourceUrl}.`
					);
				}
				totalBytesFetched += detailFetch.bytesFetched;
				totalRedirects += detailFetch.redirectChain.length;
				totalDurationMs += detailFetch.durationMs;
				detailPageCount += 1;

				const detail = parseGrantWatchDetailArtifact(decodeArtifactText(detailFetch.body));
				if (!detail.officialProgramUrl) {
					throw new Error("GrantWatch detail did not expose an official program URL.");
				}

				const validation = await validateOfficialGrantPage({
					url: detail.officialProgramUrl,
					titleHint: detail.title,
					limits,
				});
				validationCount += 1;
				totalBytesFetched += validation.fetchResult.bytesFetched;
				totalRedirects += validation.fetchResult.redirectChain.length;
				totalDurationMs += validation.fetchResult.durationMs;

				assertCrawlUsageWithinLimits(
					{
						pagesFetched: searchPageCount + detailPageCount + validationCount,
						bytesFetched: totalBytesFetched,
						redirectsFollowed: totalRedirects,
						durationMs: totalDurationMs,
						llmCalls: 0,
					},
					limits
				);

				if (!validation.valid) {
					throw new Error(validation.reason);
				}

				const normalized = normalizeCandidate(candidate, detail, validation.finalUrl);
				const upsertResult = await upsertDiscoveryOpportunity({
					sourceId: source.id,
					candidate: normalized,
					artifactKey,
					contentHash,
					observedAt: firstSearchFetch.fetchedAt,
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
					governmentLevelText: normalized.governmentLevelText,
					provinceText: normalized.provinceText,
					amountText: normalized.amountText,
					rawPayload: {
						...candidate.rawPayload,
						...detail.rawPayload,
						linkValidation: {
							requestedUrl: validation.requestedUrl,
							finalUrl: validation.finalUrl,
							status: validation.status,
							contentType: validation.contentType,
							reason: validation.reason,
						},
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
					fundingTypeText: "Grant",
					governmentLevelText: null,
					provinceText: "Canada",
					amountText: null,
					rawPayload: candidate.rawPayload,
					normalizedPayload: {},
					parseError: toErrorMessage(error),
					upsertOutcome: "parse_failed",
					opportunityId: null,
				});
			}
		}

		const summary: GrantWatchRunSummary = {
			searchPageCount,
			detailPageCount,
			validationCount,
			extractedCount: searchCandidates.length,
			parseFailureCount,
			createdCount,
			updatedCount,
		};

		await finalizeCrawlRun({
			runId: run.id,
			status: "succeeded",
			fetchedUrl: firstSearchFetch.finalUrl,
			discoveredCount: summary.extractedCount,
			normalizedCount: summary.createdCount + summary.updatedCount,
			errorMessage: null,
		});

		await logCrawlEvent({
			runId: run.id,
			sourceId: source.id,
			level: parseFailureCount > 0 ? "warn" : "info",
			eventType: "crawl_completed",
			message: "GrantWatch Canada crawl completed",
			metadata: summary,
		});

		const finalizedRun = await getCrawlRunById(run.id);
		if (!finalizedRun) {
			throw new Error(`GrantWatch crawl run ${run.id} disappeared after completion.`);
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

export async function getGrantWatchLatestAdminSnapshot() {
	await ensureGrantWatchSourceRecord();
	const source = await getSourceById(GRANTWATCH_SOURCE_ID);
	if (!source) {
		throw new Error("GrantWatch source record was not found.");
	}

	const latestRun = await getLatestCrawlRunForSource(source.id);
	if (!latestRun) {
		return {
			source,
			latestRun: null,
			latestArtifact: null,
			candidateSummary: null,
			events: [],
			description:
				"Bounded Canada-only GrantWatch crawl. Detail pages are filtered to Canada-relevant grants and retained only when the embedded official URL resolves to an accessible grant-like page.",
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
			"Bounded Canada-only GrantWatch crawl. Detail pages are filtered to Canada-relevant grants and retained only when the embedded official URL resolves to an accessible grant-like page.",
	};
}
