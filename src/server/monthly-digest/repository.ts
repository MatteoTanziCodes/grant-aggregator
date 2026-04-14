import { getFundingDb } from "@/server/cloudflare/context";
import type { IngestionRunAssessmentOutcome } from "@/server/ingestion/run-quality";

export type MonthlyDigestBatchStatus =
	| "running"
	| "completed"
	| "completed_with_failures"
	| "failed";
export type MonthlyDigestTriggeredByType = "system" | "admin";
export type MonthlyDigestDeliveryStatus =
	| "queued"
	| "sent"
	| "failed"
	| "skipped";

export type MonthlyDigestSourceOutcome = IngestionRunAssessmentOutcome;

export type MonthlyDigestSourceEntry = {
	sourceId: string;
	sourceName: string;
	crawlRunId: string | null;
	outcome: MonthlyDigestSourceOutcome;
	completenessRatio: number | null;
	discoveredCount: number;
	normalizedCount: number;
	reason: string;
	errorMessage: string | null;
};

export type MonthlyDigestOpportunityItem = {
	opportunityId: string;
	title: string;
	organizationName: string;
	programUrl: string;
	fundingCategory: string;
	amountText: string | null;
	amountMinCad: number | null;
	amountMaxCad: number | null;
	deadlineText: string | null;
	deadlineAt: string | null;
	deadlinePrecision: string;
	summary: string | null;
	provinceCodes: string[];
	sourceId: string;
	sourceName: string;
	updatedAt: string;
	truthTier: string;
	opportunityOrigin: string;
};

export type MonthlyDigestReportBody = {
	reportMonth: string;
	generatedAt: string;
	includedSources: MonthlyDigestSourceEntry[];
	excludedSources: MonthlyDigestSourceEntry[];
	opportunities: MonthlyDigestOpportunityItem[];
};

export type MonthlyDigestReportRecord = {
	id: string;
	reportMonth: string;
	slug: string;
	title: string;
	summary: Record<string, unknown>;
	body: MonthlyDigestReportBody;
	createdAt: string;
	updatedAt: string;
	publishedAt: string | null;
};

export type MonthlyDigestBatchRecord = {
	id: string;
	reportMonth: string;
	status: MonthlyDigestBatchStatus;
	triggeredByType: MonthlyDigestTriggeredByType;
	triggeredByUser: string | null;
	includedSourceCount: number;
	excludedSourceCount: number;
	emailSentCount: number;
	emailFailedCount: number;
	reportId: string | null;
	summary: Record<string, unknown>;
	errorMessage: string | null;
	startedAt: string;
	finishedAt: string | null;
};

export type VerifiedDigestSubscriber = {
	id: string;
	email: string;
};

export type MonthlyDigestRecipientDeliveryRecord = {
	id: string;
	reportId: string;
	subscriberId: string;
	emailEventId: string | null;
	deliveryStatus: MonthlyDigestDeliveryStatus;
	providerName: string | null;
	providerMessageId: string | null;
	errorMessage: string | null;
	attemptedAt: string;
	createdAt: string;
	updatedAt: string;
};

type MonthlyDigestBatchRow = {
	id: string;
	report_month: string;
	status: MonthlyDigestBatchStatus;
	triggered_by_type: MonthlyDigestTriggeredByType;
	triggered_by_user: string | null;
	included_source_count: number;
	excluded_source_count: number;
	email_sent_count: number;
	email_failed_count: number;
	report_id: string | null;
	summary_json: string;
	error_message: string | null;
	started_at: string;
	finished_at: string | null;
};

type MonthlyDigestReportRow = {
	id: string;
	report_month: string;
	slug: string;
	title: string;
	summary_json: string;
	body_json: string;
	created_at: string;
	updated_at: string;
	published_at: string | null;
};

type MonthlyDigestRecipientDeliveryRow = {
	id: string;
	report_id: string;
	subscriber_id: string;
	email_event_id: string | null;
	delivery_status: MonthlyDigestDeliveryStatus;
	provider_name: string | null;
	provider_message_id: string | null;
	error_message: string | null;
	attempted_at: string;
	created_at: string;
	updated_at: string;
};

type OpportunityReportRow = {
	opportunity_id: string;
	title: string;
	organization_name: string;
	program_url: string;
	funding_category: string;
	amount_text: string | null;
	amount_min_cad: number | null;
	amount_max_cad: number | null;
	deadline_text: string | null;
	deadline_at: string | null;
	deadline_precision: string;
	summary: string | null;
	provinces_json: string;
	source_id: string;
	source_name: string;
	updated_at: string;
	truth_tier: string;
	opportunity_origin: string;
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

function parseJsonArray(value: string): string[] {
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

function mapMonthlyDigestBatchRow(
	row: MonthlyDigestBatchRow
): MonthlyDigestBatchRecord {
	return {
		id: row.id,
		reportMonth: row.report_month,
		status: row.status,
		triggeredByType: row.triggered_by_type,
		triggeredByUser: row.triggered_by_user,
		includedSourceCount: row.included_source_count,
		excludedSourceCount: row.excluded_source_count,
		emailSentCount: row.email_sent_count,
		emailFailedCount: row.email_failed_count,
		reportId: row.report_id,
		summary: parseJsonObject(row.summary_json),
		errorMessage: row.error_message,
		startedAt: row.started_at,
		finishedAt: row.finished_at,
	};
}

function mapMonthlyDigestReportRow(
	row: MonthlyDigestReportRow
): MonthlyDigestReportRecord {
	return {
		id: row.id,
		reportMonth: row.report_month,
		slug: row.slug,
		title: row.title,
		summary: parseJsonObject(row.summary_json),
		body: parseJsonObject(row.body_json) as MonthlyDigestReportBody,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		publishedAt: row.published_at,
	};
}

function mapRecipientDeliveryRow(
	row: MonthlyDigestRecipientDeliveryRow
): MonthlyDigestRecipientDeliveryRecord {
	return {
		id: row.id,
		reportId: row.report_id,
		subscriberId: row.subscriber_id,
		emailEventId: row.email_event_id,
		deliveryStatus: row.delivery_status,
		providerName: row.provider_name,
		providerMessageId: row.provider_message_id,
		errorMessage: row.error_message,
		attemptedAt: row.attempted_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function getMonthlyDigestBatchByMonth(
	reportMonth: string
): Promise<MonthlyDigestBatchRecord | null> {
	const db = await getFundingDb();
	const row = await db
		.prepare(
			`
				SELECT
					id,
					report_month,
					status,
					triggered_by_type,
					triggered_by_user,
					included_source_count,
					excluded_source_count,
					email_sent_count,
					email_failed_count,
					report_id,
					summary_json,
					error_message,
					started_at,
					finished_at
				FROM monthly_digest_batches
				WHERE report_month = ?
				LIMIT 1
			`
		)
		.bind(reportMonth)
		.first<MonthlyDigestBatchRow>();

	return row ? mapMonthlyDigestBatchRow(row) : null;
}

export async function getLatestMonthlyDigestBatch(): Promise<MonthlyDigestBatchRecord | null> {
	const db = await getFundingDb();
	const row = await db
		.prepare(
			`
				SELECT
					id,
					report_month,
					status,
					triggered_by_type,
					triggered_by_user,
					included_source_count,
					excluded_source_count,
					email_sent_count,
					email_failed_count,
					report_id,
					summary_json,
					error_message,
					started_at,
					finished_at
				FROM monthly_digest_batches
				ORDER BY report_month DESC, started_at DESC
				LIMIT 1
			`
		)
		.first<MonthlyDigestBatchRow>();

	return row ? mapMonthlyDigestBatchRow(row) : null;
}

export async function prepareMonthlyDigestBatch(input: {
	reportMonth: string;
	triggeredByType: MonthlyDigestTriggeredByType;
	triggeredByUser?: string | null;
}): Promise<MonthlyDigestBatchRecord> {
	const db = await getFundingDb();
	const existing = await getMonthlyDigestBatchByMonth(input.reportMonth);
	const timestamp = nowIso();

	if (existing) {
		await db
			.prepare(
				`
					UPDATE monthly_digest_batches
					SET
						status = 'running',
						triggered_by_type = ?,
						triggered_by_user = ?,
						included_source_count = 0,
						excluded_source_count = 0,
						email_sent_count = 0,
						email_failed_count = 0,
						report_id = NULL,
						summary_json = '{}',
						error_message = NULL,
						started_at = ?,
						finished_at = NULL
					WHERE id = ?
				`
			)
			.bind(
				input.triggeredByType,
				input.triggeredByUser ?? null,
				timestamp,
				existing.id
			)
			.run();

		return {
			...existing,
			status: "running",
			triggeredByType: input.triggeredByType,
			triggeredByUser: input.triggeredByUser ?? null,
			includedSourceCount: 0,
			excludedSourceCount: 0,
			emailSentCount: 0,
			emailFailedCount: 0,
			reportId: null,
			summary: {},
			errorMessage: null,
			startedAt: timestamp,
			finishedAt: null,
		};
	}

	const id = crypto.randomUUID();
	await db
		.prepare(
			`
				INSERT INTO monthly_digest_batches (
					id,
					report_month,
					status,
					triggered_by_type,
					triggered_by_user,
					started_at
				)
				VALUES (?, ?, 'running', ?, ?, ?)
			`
		)
		.bind(
			id,
			input.reportMonth,
			input.triggeredByType,
			input.triggeredByUser ?? null,
			timestamp
		)
		.run();

	return {
		id,
		reportMonth: input.reportMonth,
		status: "running",
		triggeredByType: input.triggeredByType,
		triggeredByUser: input.triggeredByUser ?? null,
		includedSourceCount: 0,
		excludedSourceCount: 0,
		emailSentCount: 0,
		emailFailedCount: 0,
		reportId: null,
		summary: {},
		errorMessage: null,
		startedAt: timestamp,
		finishedAt: null,
	};
}

export async function clearMonthlyDigestBatchSources(
	batchId: string
): Promise<void> {
	const db = await getFundingDb();
	await db
		.prepare("DELETE FROM monthly_digest_batch_sources WHERE batch_id = ?")
		.bind(batchId)
		.run();
}

export async function upsertMonthlyDigestBatchSource(input: {
	batchId: string;
	sourceId: string;
	crawlRunId?: string | null;
	outcome: MonthlyDigestSourceOutcome;
	completenessRatio?: number | null;
	discoveredCount?: number;
	normalizedCount?: number;
	errorMessage?: string | null;
	details?: Record<string, unknown>;
}): Promise<void> {
	const db = await getFundingDb();
	const id = crypto.randomUUID();
	const timestamp = nowIso();

	await db
		.prepare(
			`
				INSERT INTO monthly_digest_batch_sources (
					id,
					batch_id,
					source_id,
					crawl_run_id,
					outcome,
					completeness_ratio,
					discovered_count,
					normalized_count,
					error_message,
					details_json,
					created_at,
					updated_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(batch_id, source_id) DO UPDATE SET
					crawl_run_id = excluded.crawl_run_id,
					outcome = excluded.outcome,
					completeness_ratio = excluded.completeness_ratio,
					discovered_count = excluded.discovered_count,
					normalized_count = excluded.normalized_count,
					error_message = excluded.error_message,
					details_json = excluded.details_json,
					updated_at = excluded.updated_at
			`
		)
		.bind(
			id,
			input.batchId,
			input.sourceId,
			input.crawlRunId ?? null,
			input.outcome,
			input.completenessRatio ?? null,
			input.discoveredCount ?? 0,
			input.normalizedCount ?? 0,
			input.errorMessage ?? null,
			JSON.stringify(input.details ?? {}),
			timestamp,
			timestamp
		)
		.run();
}

export async function finalizeMonthlyDigestBatch(input: {
	batchId: string;
	status: MonthlyDigestBatchStatus;
	reportId?: string | null;
	includedSourceCount: number;
	excludedSourceCount: number;
	emailSentCount: number;
	emailFailedCount: number;
	summary?: Record<string, unknown>;
	errorMessage?: string | null;
}): Promise<void> {
	const db = await getFundingDb();
	await db
		.prepare(
			`
				UPDATE monthly_digest_batches
				SET
					status = ?,
					report_id = ?,
					included_source_count = ?,
					excluded_source_count = ?,
					email_sent_count = ?,
					email_failed_count = ?,
					summary_json = ?,
					error_message = ?,
					finished_at = ?
				WHERE id = ?
			`
		)
		.bind(
			input.status,
			input.reportId ?? null,
			input.includedSourceCount,
			input.excludedSourceCount,
			input.emailSentCount,
			input.emailFailedCount,
			JSON.stringify(input.summary ?? {}),
			input.errorMessage ?? null,
			nowIso(),
			input.batchId
		)
		.run();
}

export async function upsertMonthlyDigestReport(input: {
	reportMonth: string;
	slug: string;
	title: string;
	summary: Record<string, unknown>;
	body: MonthlyDigestReportBody;
	publishedAt?: string | null;
}): Promise<MonthlyDigestReportRecord> {
	const db = await getFundingDb();
	const existing = await getMonthlyDigestReportByMonth(input.reportMonth);
	const timestamp = nowIso();
	const id = existing?.id ?? crypto.randomUUID();

	await db
		.prepare(
			`
				INSERT INTO monthly_digest_reports (
					id,
					report_month,
					slug,
					title,
					summary_json,
					body_json,
					created_at,
					updated_at,
					published_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(report_month) DO UPDATE SET
					slug = excluded.slug,
					title = excluded.title,
					summary_json = excluded.summary_json,
					body_json = excluded.body_json,
					updated_at = excluded.updated_at,
					published_at = excluded.published_at
			`
		)
		.bind(
			id,
			input.reportMonth,
			input.slug,
			input.title,
			JSON.stringify(input.summary),
			JSON.stringify(input.body),
			existing?.createdAt ?? timestamp,
			timestamp,
			input.publishedAt ?? timestamp
		)
		.run();

	return {
		id,
		reportMonth: input.reportMonth,
		slug: input.slug,
		title: input.title,
		summary: input.summary,
		body: input.body,
		createdAt: existing?.createdAt ?? timestamp,
		updatedAt: timestamp,
		publishedAt: input.publishedAt ?? timestamp,
	};
}

export async function getMonthlyDigestReportByMonth(
	reportMonth: string
): Promise<MonthlyDigestReportRecord | null> {
	const db = await getFundingDb();
	const row = await db
		.prepare(
			`
				SELECT
					id,
					report_month,
					slug,
					title,
					summary_json,
					body_json,
					created_at,
					updated_at,
					published_at
				FROM monthly_digest_reports
				WHERE report_month = ?
				LIMIT 1
			`
		)
		.bind(reportMonth)
		.first<MonthlyDigestReportRow>();

	return row ? mapMonthlyDigestReportRow(row) : null;
}

export async function getMonthlyDigestReportBySlug(
	slug: string
): Promise<MonthlyDigestReportRecord | null> {
	const db = await getFundingDb();
	const row = await db
		.prepare(
			`
				SELECT
					id,
					report_month,
					slug,
					title,
					summary_json,
					body_json,
					created_at,
					updated_at,
					published_at
				FROM monthly_digest_reports
				WHERE slug = ?
				LIMIT 1
			`
		)
		.bind(slug)
		.first<MonthlyDigestReportRow>();

	return row ? mapMonthlyDigestReportRow(row) : null;
}

export async function getLatestMonthlyDigestReport(): Promise<MonthlyDigestReportRecord | null> {
	const db = await getFundingDb();
	const row = await db
		.prepare(
			`
				SELECT
					id,
					report_month,
					slug,
					title,
					summary_json,
					body_json,
					created_at,
					updated_at,
					published_at
				FROM monthly_digest_reports
				ORDER BY report_month DESC
				LIMIT 1
			`
		)
		.first<MonthlyDigestReportRow>();

	return row ? mapMonthlyDigestReportRow(row) : null;
}

export async function listVerifiedDigestSubscribers(): Promise<
	VerifiedDigestSubscriber[]
> {
	const db = await getFundingDb();
	const result = await db
		.prepare(
			`
				SELECT id, email
				FROM subscribers
				WHERE status = 'verified' AND grant_updates_enabled = 1
				ORDER BY created_at ASC
			`
		)
		.all<VerifiedDigestSubscriber>();

	return result.results.map((row) => row as unknown as VerifiedDigestSubscriber);
}

export async function getMonthlyDigestRecipientDelivery(
	reportId: string,
	subscriberId: string
): Promise<MonthlyDigestRecipientDeliveryRecord | null> {
	const db = await getFundingDb();
	const row = await db
		.prepare(
			`
				SELECT
					id,
					report_id,
					subscriber_id,
					email_event_id,
					delivery_status,
					provider_name,
					provider_message_id,
					error_message,
					attempted_at,
					created_at,
					updated_at
				FROM monthly_digest_recipient_deliveries
				WHERE report_id = ? AND subscriber_id = ?
				LIMIT 1
			`
		)
		.bind(reportId, subscriberId)
		.first<MonthlyDigestRecipientDeliveryRow>();

	return row ? mapRecipientDeliveryRow(row) : null;
}

export async function upsertMonthlyDigestRecipientDelivery(input: {
	reportId: string;
	subscriberId: string;
	emailEventId?: string | null;
	deliveryStatus: MonthlyDigestDeliveryStatus;
	providerName?: string | null;
	providerMessageId?: string | null;
	errorMessage?: string | null;
	attemptedAt?: string;
}): Promise<void> {
	const db = await getFundingDb();
	const timestamp = input.attemptedAt ?? nowIso();
	const id = crypto.randomUUID();

	await db
		.prepare(
			`
				INSERT INTO monthly_digest_recipient_deliveries (
					id,
					report_id,
					subscriber_id,
					email_event_id,
					delivery_status,
					provider_name,
					provider_message_id,
					error_message,
					attempted_at,
					created_at,
					updated_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(report_id, subscriber_id) DO UPDATE SET
					email_event_id = excluded.email_event_id,
					delivery_status = excluded.delivery_status,
					provider_name = excluded.provider_name,
					provider_message_id = excluded.provider_message_id,
					error_message = excluded.error_message,
					attempted_at = excluded.attempted_at,
					updated_at = excluded.updated_at
			`
		)
		.bind(
			id,
			input.reportId,
			input.subscriberId,
			input.emailEventId ?? null,
			input.deliveryStatus,
			input.providerName ?? null,
			input.providerMessageId ?? null,
			input.errorMessage ?? null,
			timestamp,
			timestamp,
			timestamp
		)
		.run();
}

export async function insertMonthlyNotificationDelivery(input: {
	subscriberId: string;
	deliveryStatus: "queued" | "sent" | "failed";
	providerMessageId?: string | null;
	errorMessage?: string | null;
	sentAt?: string | null;
}): Promise<void> {
	const db = await getFundingDb();
	const createdAt = nowIso();

	await db
		.prepare(
			`
				INSERT INTO notification_deliveries (
					id,
					subscriber_id,
					opportunity_id,
					delivery_kind,
					delivery_status,
					provider_message_id,
					error_message,
					sent_at,
					created_at
				)
				VALUES (?, ?, NULL, 'grant_update_digest', ?, ?, ?, ?, ?)
			`
		)
		.bind(
			crypto.randomUUID(),
			input.subscriberId,
			input.deliveryStatus,
			input.providerMessageId ?? null,
			input.errorMessage ?? null,
			input.sentAt ?? null,
			createdAt
		)
		.run();
}

export async function listMonthlyDigestOpportunitiesForRuns(
	runIds: string[]
): Promise<MonthlyDigestOpportunityItem[]> {
	if (runIds.length === 0) {
		return [];
	}

	const db = await getFundingDb();
	const placeholders = runIds.map(() => "?").join(", ");
	const query = `
		SELECT
			o.id AS opportunity_id,
			o.title,
			o.organization_name,
			o.program_url,
			o.funding_category,
			c.amount_text,
			o.amount_min_cad,
			o.amount_max_cad,
			o.deadline_text,
			o.deadline_at,
			o.deadline_precision,
			o.summary,
			o.provinces_json,
			s.id AS source_id,
			s.name AS source_name,
			o.updated_at,
			o.truth_tier,
			o.opportunity_origin
		FROM crawl_discovery_candidates c
		INNER JOIN opportunities o
			ON o.id = c.opportunity_id
		INNER JOIN source_registry s
			ON s.id = c.source_id
		WHERE
			c.crawl_run_id IN (${placeholders})
			AND c.opportunity_id IS NOT NULL
			AND c.upsert_outcome IN ('created', 'updated')
		ORDER BY c.updated_at DESC, c.created_at DESC
	`;
	const result = await db.prepare(query).bind(...runIds).all<OpportunityReportRow>();
	const deduped = new Map<string, MonthlyDigestOpportunityItem>();

	for (const rawRow of result.results) {
		const row = rawRow as unknown as OpportunityReportRow;
		if (deduped.has(row.opportunity_id)) {
			continue;
		}

		deduped.set(row.opportunity_id, {
			opportunityId: row.opportunity_id,
			title: row.title,
			organizationName: row.organization_name,
			programUrl: row.program_url,
			fundingCategory: row.funding_category,
			amountText: row.amount_text,
			amountMinCad: row.amount_min_cad,
			amountMaxCad: row.amount_max_cad,
			deadlineText: row.deadline_text,
			deadlineAt: row.deadline_at,
			deadlinePrecision: row.deadline_precision,
			summary: row.summary,
			provinceCodes: parseJsonArray(row.provinces_json),
			sourceId: row.source_id,
			sourceName: row.source_name,
			updatedAt: row.updated_at,
			truthTier: row.truth_tier,
			opportunityOrigin: row.opportunity_origin,
		});
	}

	return [...deduped.values()];
}
