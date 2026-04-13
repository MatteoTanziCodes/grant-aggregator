import { getFundingDb } from "@/server/cloudflare/context";
import {
	GRANTCOMPASS_SOURCE_ID,
	GRANTCOMPASS_SOURCE_URL,
} from "@/server/ingestion/grantcompass/constants";

export type DiscoveryTruthTier = "discovery" | "canonical";

export type GrantCompassNormalizedCandidate = {
	externalKey: string;
	sourceUrl: string;
	rowNumber: number;
	grantCompassId: number;
	slug: string | null;
	officialProgramUrl: string | null;
	title: string;
	organizationName: string;
	amountText: string;
	amountMinCad: number | null;
	amountMaxCad: number | null;
	deadlineText: string | null;
	deadlineAt: string | null;
	deadlinePrecision: "exact" | "rolling" | "window" | "unknown";
	deadlineVerified: boolean;
	fundingTypeText: string;
	governmentLevelText: string;
	provinceText: string;
	provinceCodes: string[];
	programUrl: string;
	fundingCategory:
		| "grant"
		| "non_repayable_contribution"
		| "loan"
		| "loan_guarantee"
		| "pitch_competition"
		| "accelerator_funding"
		| "incubator_funding"
		| "equity_program";
	summary: string | null;
	recordStatus: "draft" | "active" | "closed" | "rejected";
	truthTier: DiscoveryTruthTier;
	opportunityOrigin: "grantcompass";
	directFunding: boolean;
	canadianBusinessEligible: boolean;
	industryTags: string[];
	businessStages: string[];
	founderTags: string[];
	programStatusText: string | null;
	normalizedPayload: Record<string, unknown>;
};

export type GrantCompassCandidateIngestionRow = {
	id: string;
	crawlRunId: string;
	sourceId: string;
	externalKey: string;
	sourceUrl: string;
	title: string | null;
	organizationName: string | null;
	fundingTypeText: string | null;
	governmentLevelText: string | null;
	provinceText: string | null;
	amountText: string | null;
	rawPayload: Record<string, unknown>;
	normalizedPayload: Record<string, unknown>;
	parseError: string | null;
	upsertOutcome: "created" | "updated" | "skipped" | "parse_failed" | null;
	opportunityId: string | null;
	createdAt: string;
	updatedAt: string;
};

export type GrantCompassLatestRunSummary = {
	totalCandidates: number;
	parseFailures: number;
	createdCount: number;
	updatedCount: number;
	skippedCount: number;
	items: GrantCompassCandidateIngestionRow[];
};

type CandidateRow = {
	id: string;
	crawl_run_id: string;
	source_id: string;
	external_key: string;
	source_url: string;
	title: string | null;
	organization_name: string | null;
	funding_type_text: string | null;
	government_level_text: string | null;
	province_text: string | null;
	amount_text: string | null;
	raw_payload_json: string;
	normalized_payload_json: string;
	parse_error: string | null;
	upsert_outcome: "created" | "updated" | "skipped" | "parse_failed" | null;
	opportunity_id: string | null;
	created_at: string;
	updated_at: string;
};

type OpportunityLookupRow = {
	id: string;
};

function nowIso(): string {
	return new Date().toISOString();
}

function parseJsonObject(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function mapCandidateRow(row: CandidateRow): GrantCompassCandidateIngestionRow {
	return {
		id: row.id,
		crawlRunId: row.crawl_run_id,
		sourceId: row.source_id,
		externalKey: row.external_key,
		sourceUrl: row.source_url,
		title: row.title,
		organizationName: row.organization_name,
		fundingTypeText: row.funding_type_text,
		governmentLevelText: row.government_level_text,
		provinceText: row.province_text,
		amountText: row.amount_text,
		rawPayload: parseJsonObject(row.raw_payload_json),
		normalizedPayload: parseJsonObject(row.normalized_payload_json),
		parseError: row.parse_error,
		upsertOutcome: row.upsert_outcome,
		opportunityId: row.opportunity_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function ensureGrantCompassSourceRecord(): Promise<void> {
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
			GRANTCOMPASS_SOURCE_ID,
			"GrantCompass",
			GRANTCOMPASS_SOURCE_URL,
			"grantcompass-explore-json",
			"Discovery-only aggregator source. Fetches the public explore dataset JSON behind GrantCompass search. Official program pages must override GrantCompass-derived data when canonical sources are added.",
			timestamp,
			timestamp
		)
		.run();
}

async function findExistingOpportunityByDiscoveryKey(
	sourceId: string,
	discoveryKey: string
): Promise<OpportunityLookupRow | null> {
	const db = await getFundingDb();
	return db
		.prepare(
			`
				SELECT id
				FROM opportunities
				WHERE origin_source_id = ? AND discovery_key = ?
				LIMIT 1
			`
		)
		.bind(sourceId, discoveryKey)
		.first<OpportunityLookupRow>();
}

export async function writeGrantCompassCandidateObservation(input: {
	crawlRunId: string;
	sourceId: string;
	externalKey: string;
	sourceUrl: string;
	title?: string | null;
	organizationName?: string | null;
	fundingTypeText?: string | null;
	governmentLevelText?: string | null;
	provinceText?: string | null;
	amountText?: string | null;
	rawPayload: Record<string, unknown>;
	normalizedPayload?: Record<string, unknown>;
	parseError?: string | null;
	upsertOutcome?: GrantCompassCandidateIngestionRow["upsertOutcome"];
	opportunityId?: string | null;
}): Promise<void> {
	const db = await getFundingDb();
	const id = crypto.randomUUID();
	const timestamp = nowIso();

	await db
		.prepare(
			`
				INSERT INTO crawl_discovery_candidates (
					id,
					crawl_run_id,
					source_id,
					external_key,
					source_url,
					title,
					organization_name,
					funding_type_text,
					government_level_text,
					province_text,
					amount_text,
					raw_payload_json,
					normalized_payload_json,
					parse_error,
					upsert_outcome,
					opportunity_id,
					created_at,
					updated_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(crawl_run_id, external_key) DO UPDATE SET
					source_url = excluded.source_url,
					title = excluded.title,
					organization_name = excluded.organization_name,
					funding_type_text = excluded.funding_type_text,
					government_level_text = excluded.government_level_text,
					province_text = excluded.province_text,
					amount_text = excluded.amount_text,
					raw_payload_json = excluded.raw_payload_json,
					normalized_payload_json = excluded.normalized_payload_json,
					parse_error = excluded.parse_error,
					upsert_outcome = excluded.upsert_outcome,
					opportunity_id = excluded.opportunity_id,
					updated_at = excluded.updated_at
			`
		)
		.bind(
			id,
			input.crawlRunId,
			input.sourceId,
			input.externalKey,
			input.sourceUrl,
			input.title ?? null,
			input.organizationName ?? null,
			input.fundingTypeText ?? null,
			input.governmentLevelText ?? null,
			input.provinceText ?? null,
			input.amountText ?? null,
			JSON.stringify(input.rawPayload),
			JSON.stringify(input.normalizedPayload ?? {}),
			input.parseError ?? null,
			input.upsertOutcome ?? null,
			input.opportunityId ?? null,
			timestamp,
			timestamp
		)
		.run();
}

export async function upsertGrantCompassOpportunity(input: {
	sourceId: string;
	candidate: GrantCompassNormalizedCandidate;
	artifactKey: string | null;
	contentHash: string | null;
	observedAt: string;
}): Promise<{
	opportunityId: string;
	outcome: "created" | "updated";
}> {
	const db = await getFundingDb();
	const existing = await findExistingOpportunityByDiscoveryKey(input.sourceId, input.candidate.externalKey);
	const timestamp = nowIso();
	const opportunityId = existing?.id ?? crypto.randomUUID();

	if (existing) {
		await db
			.prepare(
				`
					UPDATE opportunities
					SET
						canonical_source_id = ?,
						origin_source_id = ?,
						title = ?,
						program_url = ?,
						organization_name = ?,
						funding_category = ?,
						record_status = ?,
						amount_min_cad = ?,
						amount_max_cad = ?,
						deadline_text = ?,
						deadline_at = ?,
						deadline_precision = ?,
						deadline_verified = ?,
						summary = ?,
						eligibility_summary = ?,
						provinces_json = ?,
						sectors_json = ?,
						business_stages_json = ?,
						founder_tags_json = ?,
						direct_funding = ?,
						canadian_business_eligible = ?,
						last_verified_at = NULL,
						truth_tier = ?,
						opportunity_origin = ?,
						discovery_key = ?,
						updated_at = ?
					WHERE id = ?
				`
			)
			.bind(
				input.sourceId,
				input.sourceId,
				input.candidate.title,
				input.candidate.programUrl,
				input.candidate.organizationName,
				input.candidate.fundingCategory,
				input.candidate.recordStatus,
				input.candidate.amountMinCad,
				input.candidate.amountMaxCad,
				input.candidate.deadlineText,
				input.candidate.deadlineAt,
				input.candidate.deadlinePrecision,
				input.candidate.deadlineVerified ? 1 : 0,
				input.candidate.summary,
				null,
				JSON.stringify(input.candidate.provinceCodes),
				JSON.stringify(input.candidate.industryTags),
				JSON.stringify(input.candidate.businessStages),
				JSON.stringify(input.candidate.founderTags),
				input.candidate.directFunding ? 1 : 0,
				input.candidate.canadianBusinessEligible ? 1 : 0,
				input.candidate.truthTier,
				input.candidate.opportunityOrigin,
				input.candidate.externalKey,
				timestamp,
				opportunityId
			)
			.run();
	} else {
		await db
			.prepare(
				`
					INSERT INTO opportunities (
						id,
						canonical_source_id,
						origin_source_id,
						title,
						program_url,
						organization_name,
						funding_category,
						record_status,
						amount_min_cad,
						amount_max_cad,
						deadline_text,
						deadline_at,
						deadline_precision,
						deadline_verified,
						summary,
						eligibility_summary,
						provinces_json,
						sectors_json,
						business_stages_json,
						founder_tags_json,
						direct_funding,
						canadian_business_eligible,
						last_verified_at,
						created_at,
						updated_at,
						truth_tier,
						opportunity_origin,
						discovery_key
					)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
				`
			)
			.bind(
				opportunityId,
				input.sourceId,
				input.sourceId,
				input.candidate.title,
				input.candidate.programUrl,
				input.candidate.organizationName,
				input.candidate.fundingCategory,
				input.candidate.recordStatus,
				input.candidate.amountMinCad,
				input.candidate.amountMaxCad,
				input.candidate.deadlineText,
				input.candidate.deadlineAt,
				input.candidate.deadlinePrecision,
				input.candidate.deadlineVerified ? 1 : 0,
				input.candidate.summary,
				JSON.stringify(input.candidate.provinceCodes),
				JSON.stringify(input.candidate.industryTags),
				JSON.stringify(input.candidate.businessStages),
				JSON.stringify(input.candidate.founderTags),
				input.candidate.directFunding ? 1 : 0,
				input.candidate.canadianBusinessEligible ? 1 : 0,
				timestamp,
				timestamp,
				input.candidate.truthTier,
				input.candidate.opportunityOrigin,
				input.candidate.externalKey
			)
			.run();
	}

	await db
		.prepare(
			`
				INSERT INTO opportunity_evidence (
					id,
					opportunity_id,
					source_id,
					source_url,
					evidence_kind,
					title,
					excerpt,
					artifact_key,
					content_hash,
					observed_at
				)
				VALUES (?, ?, ?, ?, 'aggregator_listing', ?, ?, ?, ?, ?)
			`
		)
		.bind(
			crypto.randomUUID(),
			opportunityId,
			input.sourceId,
			input.candidate.sourceUrl,
			input.candidate.title,
			[
				input.candidate.organizationName,
				input.candidate.amountText,
				input.candidate.fundingTypeText,
				input.candidate.governmentLevelText,
				input.candidate.provinceText,
			].join(" | "),
			input.artifactKey,
			input.contentHash,
			input.observedAt
		)
		.run();

	return {
		opportunityId,
		outcome: existing ? "updated" : "created",
	};
}

export async function getGrantCompassRunCandidateSummary(
	crawlRunId: string
): Promise<GrantCompassLatestRunSummary> {
	const db = await getFundingDb();
	const [countResult, rowsResult] = await db.batch([
		db
			.prepare(
				`
					SELECT
						COUNT(*) AS total_candidates,
						SUM(CASE WHEN parse_error IS NOT NULL THEN 1 ELSE 0 END) AS parse_failures,
						SUM(CASE WHEN upsert_outcome = 'created' THEN 1 ELSE 0 END) AS created_count,
						SUM(CASE WHEN upsert_outcome = 'updated' THEN 1 ELSE 0 END) AS updated_count,
						SUM(CASE WHEN upsert_outcome = 'skipped' THEN 1 ELSE 0 END) AS skipped_count
					FROM crawl_discovery_candidates
					WHERE crawl_run_id = ?
				`
			)
			.bind(crawlRunId),
		db
			.prepare(
				`
					SELECT
						id,
						crawl_run_id,
						source_id,
						external_key,
						source_url,
						title,
						organization_name,
						funding_type_text,
						government_level_text,
						province_text,
						amount_text,
						raw_payload_json,
						normalized_payload_json,
						parse_error,
						upsert_outcome,
						opportunity_id,
						created_at,
						updated_at
					FROM crawl_discovery_candidates
					WHERE crawl_run_id = ?
					ORDER BY updated_at DESC, created_at DESC
					LIMIT 50
				`
			)
			.bind(crawlRunId),
	]);

	const counts = (countResult.results[0] as
		| {
				total_candidates?: number;
				parse_failures?: number;
				created_count?: number;
				updated_count?: number;
				skipped_count?: number;
		  }
		| undefined) ?? {};

	return {
		totalCandidates: counts.total_candidates ?? 0,
		parseFailures: counts.parse_failures ?? 0,
		createdCount: counts.created_count ?? 0,
		updatedCount: counts.updated_count ?? 0,
		skippedCount: counts.skipped_count ?? 0,
		items: rowsResult.results.map((row) => mapCandidateRow(row as unknown as CandidateRow)),
	};
}
