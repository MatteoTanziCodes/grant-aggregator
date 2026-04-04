import { listCrawlArtifactsForRun } from "@/server/ingestion/artifact-storage";
import { listCrawlEventsForRun, logCrawlEvent } from "@/server/ingestion/crawl-logging";
import { GRANTCOMPASS_OPPORTUNITY_ORIGIN, GRANTCOMPASS_SOURCE_ID } from "@/server/ingestion/grantcompass/constants";
import {
	ensureGrantCompassSourceRecord,
	getGrantCompassRunCandidateSummary,
	type GrantCompassNormalizedCandidate,
	upsertGrantCompassOpportunity,
	writeGrantCompassCandidateObservation,
} from "@/server/ingestion/grantcompass/repository";
import {
	parseGrantCompassDatasetArtifact,
	type GrantCompassExtractedCandidate,
} from "@/server/ingestion/grantcompass/parser";
import {
	getLatestCrawlRunForSource,
	getSourceById,
} from "@/server/ingestion/repository";
import { runSingleSourceCrawl, type SingleSourceCrawlProcessorContext } from "@/server/ingestion/run-single-source-crawl";

type GrantCompassRunSummary = {
	extractedCount: number;
	parseFailureCount: number;
	createdCount: number;
	updatedCount: number;
	evidenceCount: number;
};

function decodeArtifactText(bytes: Uint8Array): string {
	return new TextDecoder().decode(bytes);
}

function toErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return "Unknown GrantCompass ingestion error.";
}

function normalizeAmountRange(amountText: string): { amountMinCad: number | null; amountMaxCad: number | null } {
	const normalized = amountText.replace(/,/g, "").replace(/\s+/g, " ").trim();
	const percentOnly = normalized.includes("%") && !normalized.includes("$");
	if (!normalized || normalized.toLowerCase() === "varies" || percentOnly) {
		return { amountMinCad: null, amountMaxCad: null };
	}

	const matches = Array.from(normalized.matchAll(/\$?(\d+(?:\.\d+)?)\s*([KMB])?/gi));
	if (matches.length === 0) {
		return { amountMinCad: null, amountMaxCad: null };
	}

	const values = matches
		.map((match) => {
			const base = Number.parseFloat(match[1]);
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
		return {
			amountMinCad: null,
			amountMaxCad: values[0] ?? null,
		};
	}

	if (values.length === 1) {
		return {
			amountMinCad: values[0],
			amountMaxCad: values[0],
		};
	}

	return {
		amountMinCad: values[0],
		amountMaxCad: values[1],
	};
}

function mapFundingTypeToCategory(
	fundingTypeText: string
): GrantCompassNormalizedCandidate["fundingCategory"] {
	switch (fundingTypeText.trim().toLowerCase()) {
		case "grant":
			return "grant";
		case "program":
			return "accelerator_funding";
		case "loan":
			return "loan";
		case "forgivable loan":
			return "loan_guarantee";
		case "award":
			return "pitch_competition";
		case "tax credit":
			return "non_repayable_contribution";
		default:
			return "grant";
	}
}

function mapProgramStatusToRecordStatus(
	programStatusText: string | null
): GrantCompassNormalizedCandidate["recordStatus"] {
	switch (programStatusText?.trim().toLowerCase()) {
		case "closed":
		case "discontinued":
		case "paused":
		case "winding-down":
			return "closed";
		default:
			return "active";
	}
}

function normalizeCandidate(
	candidate: GrantCompassExtractedCandidate
): GrantCompassNormalizedCandidate {
	const { amountMinCad, amountMaxCad } = normalizeAmountRange(candidate.amountText);
	const fundingCategory = mapFundingTypeToCategory(candidate.fundingTypeText);
	const recordStatus = mapProgramStatusToRecordStatus(candidate.programStatusText);

	return {
		externalKey: candidate.externalKey,
		sourceUrl: candidate.sourceUrl,
		rowNumber: candidate.rowNumber,
		grantCompassId: candidate.grantCompassId,
		slug: candidate.slug,
		officialProgramUrl: candidate.officialProgramUrl,
		title: candidate.title,
		organizationName: candidate.organizationName,
		amountText: candidate.amountText,
		amountMinCad,
		amountMaxCad,
		fundingTypeText: candidate.fundingTypeText,
		governmentLevelText: candidate.governmentLevelText,
		provinceText: candidate.provinceText,
		provinceCodes: candidate.provinceCodes,
		programUrl: candidate.officialProgramUrl ?? candidate.sourceUrl,
		fundingCategory,
		summary: candidate.summary,
		recordStatus,
		truthTier: "discovery",
		opportunityOrigin: GRANTCOMPASS_OPPORTUNITY_ORIGIN,
		directFunding: candidate.fundingTypeText.trim().toLowerCase() !== "program",
		canadianBusinessEligible: true,
		industryTags: candidate.industryTags,
		businessStages: candidate.businessStages,
		founderTags: candidate.founderTags,
		programStatusText: candidate.programStatusText,
		normalizedPayload: {
			externalKey: candidate.externalKey,
			grantCompassId: candidate.grantCompassId,
			slug: candidate.slug,
			sourceUrl: candidate.sourceUrl,
			officialProgramUrl: candidate.officialProgramUrl,
			rowNumber: candidate.rowNumber,
			title: candidate.title,
			organizationName: candidate.organizationName,
			amountText: candidate.amountText,
			amountMinCad,
			amountMaxCad,
			fundingTypeText: candidate.fundingTypeText,
			governmentLevelText: candidate.governmentLevelText,
			provinceText: candidate.provinceText,
			provinceCodes: candidate.provinceCodes,
			industryTags: candidate.industryTags,
			businessStages: candidate.businessStages,
			founderTags: candidate.founderTags,
			programUrl: candidate.officialProgramUrl ?? candidate.sourceUrl,
			fundingCategory,
			summary: candidate.summary,
			recordStatus,
			programStatusText: candidate.programStatusText,
			truthTier: "discovery",
			opportunityOrigin: GRANTCOMPASS_OPPORTUNITY_ORIGIN,
		},
	};
}

async function processGrantCompassArtifact(
	context: SingleSourceCrawlProcessorContext
): Promise<GrantCompassRunSummary> {
	await logCrawlEvent({
		runId: context.run.id,
		sourceId: context.source.id,
		level: "info",
		eventType: "grantcompass_parse_started",
		message: "Parsing GrantCompass dataset artifact",
		metadata: {
			artifactStatus: context.artifact.status,
			finalUrl: context.fetchResult.finalUrl,
		},
	});

	const payloadText = decodeArtifactText(context.fetchResult.body);
	const extractedCandidates = await parseGrantCompassDatasetArtifact(payloadText);
	const artifactKey =
		context.artifact.status === "stored" ? context.artifact.artifact.storageKey : null;
	const contentHash =
		context.artifact.status === "stored" ? context.artifact.artifact.contentHash : null;

	let parseFailureCount = 0;
	let createdCount = 0;
	let updatedCount = 0;
	let evidenceCount = 0;

	for (const extracted of extractedCandidates) {
		try {
			const normalized = normalizeCandidate(extracted);
			const upsertResult = await upsertGrantCompassOpportunity({
				sourceId: context.source.id,
				candidate: normalized,
				artifactKey,
				contentHash,
				observedAt: context.fetchResult.fetchedAt,
			});

			if (upsertResult.outcome === "created") {
				createdCount += 1;
			} else {
				updatedCount += 1;
			}
			evidenceCount += 1;

			await writeGrantCompassCandidateObservation({
				crawlRunId: context.run.id,
				sourceId: context.source.id,
				externalKey: extracted.externalKey,
				sourceUrl: extracted.sourceUrl,
				title: extracted.title,
				organizationName: extracted.organizationName,
				fundingTypeText: extracted.fundingTypeText,
				governmentLevelText: extracted.governmentLevelText,
				provinceText: extracted.provinceText,
				amountText: extracted.amountText,
				rawPayload: extracted.rawPayload,
				normalizedPayload: normalized.normalizedPayload,
				parseError: null,
				upsertOutcome: upsertResult.outcome,
				opportunityId: upsertResult.opportunityId,
			});
		} catch (error) {
			parseFailureCount += 1;
			await writeGrantCompassCandidateObservation({
				crawlRunId: context.run.id,
				sourceId: context.source.id,
				externalKey: extracted.externalKey,
				sourceUrl: extracted.sourceUrl,
				title: extracted.title,
				organizationName: extracted.organizationName,
				fundingTypeText: extracted.fundingTypeText,
				governmentLevelText: extracted.governmentLevelText,
				provinceText: extracted.provinceText,
				amountText: extracted.amountText,
				rawPayload: extracted.rawPayload,
				normalizedPayload: {},
				parseError: toErrorMessage(error),
				upsertOutcome: "parse_failed",
				opportunityId: null,
			});
		}
	}

	await logCrawlEvent({
		runId: context.run.id,
		sourceId: context.source.id,
		level: parseFailureCount > 0 ? "warn" : "info",
		eventType: "grantcompass_parse_completed",
		message: "GrantCompass discovery parse completed",
		metadata: {
			extractedCount: extractedCandidates.length,
			parseFailureCount,
			createdCount,
			updatedCount,
			evidenceCount,
			artifactStored: context.artifact.status === "stored",
		},
	});

	return {
		extractedCount: extractedCandidates.length,
		parseFailureCount,
		createdCount,
		updatedCount,
		evidenceCount,
	};
}

export async function runGrantCompassDiscoverySlice() {
	await ensureGrantCompassSourceRecord();

	return runSingleSourceCrawl(GRANTCOMPASS_SOURCE_ID, {
		processFetchedRun: async (context) => {
			const summary = await processGrantCompassArtifact(context);
			return {
				discoveredCount: summary.extractedCount,
				normalizedCount: summary.createdCount + summary.updatedCount,
				metadata: summary,
			};
		},
	});
}

export async function getGrantCompassLatestAdminSnapshot() {
	await ensureGrantCompassSourceRecord();
	const source = await getSourceById(GRANTCOMPASS_SOURCE_ID);
	if (!source) {
		throw new Error("GrantCompass source record was not found.");
	}

	const latestRun = await getLatestCrawlRunForSource(source.id);
	if (!latestRun) {
		return {
			source,
			latestRun: null,
			latestArtifact: null,
			candidateSummary: null,
			events: [],
		};
	}

	const [latestArtifact, candidateSummary, events] = await Promise.all([
		listCrawlArtifactsForRun(latestRun.id).then((items) => items[0] ?? null),
		getGrantCompassRunCandidateSummary(latestRun.id),
		listCrawlEventsForRun(latestRun.id, 25),
	]);

	return {
		source,
		latestRun,
		latestArtifact,
		candidateSummary,
		events,
	};
}
