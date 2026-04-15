import {
	createDefaultCrawlArtifactPersister,
	listCrawlArtifactsForRun,
} from "@/server/ingestion/artifact-storage";
import { inferCanadianProvinceCodes } from "@/server/ingestion/canadian-location";
import { getFundingDb } from "@/server/cloudflare/context";
import { validateOfficialGrantPage } from "@/server/ingestion/discovery-validation";
import { listCrawlEventsForRun, logCrawlEvent } from "@/server/ingestion/crawl-logging";
import {
	GRANTPORTAL_OPPORTUNITY_ORIGIN,
	GRANTPORTAL_SEARCH_RESULTS_URL,
	GRANTPORTAL_SOURCE_ID,
	GRANTPORTAL_SOURCE_URL,
} from "@/server/ingestion/grantportal/constants";
import {
	parseGrantPortalCsrfToken,
	parseGrantPortalDetailArtifact,
	parseGrantPortalSearchResults,
	type GrantPortalDetailCandidate,
	type GrantPortalSearchCandidate,
} from "@/server/ingestion/grantportal/parser";
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

type GrantPortalRunSummary = {
	searchPageCount: number;
	detailPageCount: number;
	validationCount: number;
	extractedCount: number;
	parseFailureCount: number;
	createdCount: number;
	updatedCount: number;
};

const GRANTPORTAL_CRAWL_LIMITS: CrawlRunLimits = {
	...DEFAULT_CRAWL_LIMITS,
	maxPagesPerRun: 50,
	maxBytesPerRun: 30_000_000,
	maxDurationMs: 180_000,
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

	return "Unknown GrantPortal ingestion error.";
}

function buildCookieHeader(setCookieHeaders: string[]): string {
	return setCookieHeaders
		.map((value) => value.split(";", 1)[0]?.trim() ?? "")
		.filter(Boolean)
		.join("; ");
}

function mapGrantPortalCategory(
	fundingTypeText: string
): DiscoveryNormalizedCandidate["fundingCategory"] {
	const normalized = fundingTypeText.toLowerCase();
	if (normalized.includes("loan guarantee")) {
		return "loan_guarantee";
	}
	if (
		normalized.includes("loan") ||
		normalized.includes("repayable contribution") ||
		normalized.includes("financing")
	) {
		return "loan";
	}
	if (normalized.includes("tax credit") || normalized.includes("rebate")) {
		return "non_repayable_contribution";
	}
	if (
		normalized.includes("equity") ||
		normalized.includes("investor") ||
		normalized.includes("venture")
	) {
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

	return {
		amountMinCad: values[0] ?? null,
		amountMaxCad: values[1] ?? values[0] ?? null,
	};
}

function normalizeDeadlinePrecision(deadlineText: string | null): DiscoveryNormalizedCandidate["deadlinePrecision"] {
	const normalized = deadlineText?.trim().toLowerCase() ?? "";
	if (!normalized || normalized === "not provided" || normalized === "pending") {
		return "unknown";
	}
	if (normalized.includes("ongoing") || normalized.includes("rolling")) {
		return "rolling";
	}
	return "window";
}

function inferRecordStatus(summary: string | null, deadlineText: string | null): DiscoveryNormalizedCandidate["recordStatus"] {
	const normalized = `${summary ?? ""} ${deadlineText ?? ""}`.toLowerCase();
	if (
		normalized.includes("all funding available under this program has been committed") ||
		normalized.includes("closed")
	) {
		return "closed";
	}
	return "active";
}

function normalizeCandidate(
	searchCandidate: GrantPortalSearchCandidate,
	detail: GrantPortalDetailCandidate,
	validatedProgramUrl: string
): DiscoveryNormalizedCandidate {
	const fundingCategory = mapGrantPortalCategory(detail.fundingTypeText);
	const { amountMinCad, amountMaxCad } = normalizeAmountRange(detail.amountText);
	const provinceCodes =
		detail.provinceCodes.length > 0
			? detail.provinceCodes
			: inferCanadianProvinceCodes(`${detail.regionText} ${searchCandidate.title}`);

	return {
		externalKey: searchCandidate.externalKey,
		sourceUrl: searchCandidate.sourceUrl,
		title: detail.title,
		organizationName: detail.organizationName ?? "Unknown organization",
		amountText: detail.amountText ?? "Unknown",
		amountMinCad,
		amountMaxCad,
		deadlineText: detail.deadlineText ?? searchCandidate.deadlineText,
		deadlineAt: null,
		deadlinePrecision: normalizeDeadlinePrecision(detail.deadlineText ?? searchCandidate.deadlineText),
		deadlineVerified: false,
		fundingTypeText: detail.fundingTypeText,
		governmentLevelText: detail.organizationName ?? "Unknown",
		provinceText: detail.regionText,
		provinceCodes,
		programUrl: validatedProgramUrl,
		fundingCategory,
		summary: detail.summary ?? searchCandidate.summary,
		recordStatus: inferRecordStatus(detail.summary ?? searchCandidate.summary, detail.deadlineText),
		truthTier: "discovery",
		opportunityOrigin: GRANTPORTAL_OPPORTUNITY_ORIGIN,
		directFunding: fundingCategory !== "equity_program",
		canadianBusinessEligible: true,
		industryTags: detail.industryTags,
		businessStages: [],
		founderTags: [],
		programStatusText: null,
		normalizedPayload: {
			programId: searchCandidate.programId,
			sourceUrl: searchCandidate.sourceUrl,
			title: detail.title,
			organizationName: detail.organizationName,
			amountText: detail.amountText,
			amountMinCad,
			amountMaxCad,
			deadlineText: detail.deadlineText ?? searchCandidate.deadlineText,
			fundingTypeText: detail.fundingTypeText,
			regionText: detail.regionText,
			provinceCodes,
			applicantTypeText: detail.applicantTypeText,
			industryTags: detail.industryTags,
			officialProgramUrl: validatedProgramUrl,
			summary: detail.summary ?? searchCandidate.summary,
			eligibilitySummary: detail.eligibilitySummary,
			fundingCategory,
			truthTier: "discovery",
			opportunityOrigin: GRANTPORTAL_OPPORTUNITY_ORIGIN,
		},
	};
}

async function ensureGrantPortalSourceRecord(): Promise<void> {
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
			GRANTPORTAL_SOURCE_ID,
			"GrantPortal",
			GRANTPORTAL_SOURCE_URL,
			"grantportal-public-search-html",
			"Discovery-only aggregator source. Uses GrantPortal's public Canada search flow and retains only records whose embedded official Link resolves to an accessible grant-like page.",
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

export async function runGrantPortalDirectoryCrawl(
	limits: CrawlRunLimits = GRANTPORTAL_CRAWL_LIMITS
) {
	await ensureGrantPortalSourceRecord();
	const source = await getSourceById(GRANTPORTAL_SOURCE_ID);
	if (!source) {
		throw new Error("GrantPortal source record was not found.");
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
			message: `Started public search crawl for ${source.name}`,
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
			throw new Error(`GrantPortal search page returned HTTP ${initialFetch.status}.`);
		}

		const csrfToken = parseGrantPortalCsrfToken(decodeArtifactText(initialFetch.body));
		const cookieHeader = buildCookieHeader(initialFetch.setCookieHeaders);
		const searchBody = new URLSearchParams({
			_token: csrfToken,
			text: "",
			source: "public",
			country: "ca",
		}).toString();
		const resultsFetch = await fetchWithGuards({
			url: GRANTPORTAL_SEARCH_RESULTS_URL,
			limits,
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded; charset=UTF-8",
				"x-requested-with": "XMLHttpRequest",
				referer: source.baseUrl,
				...(cookieHeader ? { cookie: cookieHeader } : {}),
			},
			body: searchBody,
		});
		lastFetchUrl = resultsFetch.finalUrl;
		if (!resultsFetch.ok) {
			throw new Error(`GrantPortal search results returned HTTP ${resultsFetch.status}.`);
		}

		let totalBytesFetched = initialFetch.bytesFetched + resultsFetch.bytesFetched;
		let totalRedirects = initialFetch.redirectChain.length + resultsFetch.redirectChain.length;
		let totalDurationMs = initialFetch.durationMs + resultsFetch.durationMs;
		const searchCandidates = parseGrantPortalSearchResults(decodeArtifactText(resultsFetch.body));
		const artifactKey = artifact.status === "stored" ? artifact.artifact.storageKey : null;
		const contentHash = artifact.status === "stored" ? artifact.artifact.contentHash : null;
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
						`GrantPortal detail fetch returned HTTP ${detailFetch.status} for ${candidate.sourceUrl}.`
					);
				}
				totalBytesFetched += detailFetch.bytesFetched;
				totalRedirects += detailFetch.redirectChain.length;
				totalDurationMs += detailFetch.durationMs;
				detailPageCount += 1;

				const detail = parseGrantPortalDetailArtifact(decodeArtifactText(detailFetch.body));
				if (!detail.officialProgramUrl) {
					throw new Error("GrantPortal record did not expose an official program link.");
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
						pagesFetched: 2 + detailPageCount + validationCount,
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
					observedAt: resultsFetch.fetchedAt,
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
					fundingTypeText: candidate.fundingTypeText,
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

		const summary: GrantPortalRunSummary = {
			searchPageCount: 1,
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
			fetchedUrl: resultsFetch.finalUrl,
			discoveredCount: summary.extractedCount,
			normalizedCount: summary.createdCount + summary.updatedCount,
			errorMessage: null,
		});

		await logCrawlEvent({
			runId: run.id,
			sourceId: source.id,
			level: parseFailureCount > 0 ? "warn" : "info",
			eventType: "crawl_completed",
			message: "GrantPortal search crawl completed",
			metadata: summary,
		});

		const finalizedRun = await getCrawlRunById(run.id);
		if (!finalizedRun) {
			throw new Error(`GrantPortal crawl run ${run.id} disappeared after completion.`);
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

export async function getGrantPortalLatestAdminSnapshot() {
	await ensureGrantPortalSourceRecord();
	const source = await getSourceById(GRANTPORTAL_SOURCE_ID);
	if (!source) {
		throw new Error("GrantPortal source record was not found.");
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
				"Bounded public-search crawl of GrantPortal's Canada feed. Only records whose embedded official Link resolves to an accessible grant-like page are retained.",
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
			"Bounded public-search crawl of GrantPortal's Canada feed. Only records whose embedded official Link resolves to an accessible grant-like page are retained.",
	};
}
