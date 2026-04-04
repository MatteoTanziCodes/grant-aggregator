import { getFundingDb } from "@/server/cloudflare/context";
import { normalizeEmailAddress } from "@/server/subscriptions/repository";

export type AdminSubscriberStatus = "pending_verification" | "verified" | "unsubscribed";
export type AdminEmailEventStatus = "queued" | "sent" | "failed" | "skipped";

export type AdminSubscriberListItem = {
	id: string;
	email: string;
	status: AdminSubscriberStatus;
	sourceLabel: string | null;
	createdAt: string;
	updatedAt: string;
	verificationSentAt: string | null;
	verifiedAt: string | null;
	unsubscribedAt: string | null;
	lastDeliveryStatus: AdminEmailEventStatus | null;
	lastDeliveryTime: string | null;
	lastDeliveryError: string | null;
};

export type AdminEmailEventItem = {
	id: string;
	emailType: string;
	recipientEmail: string;
	subscriberId: string | null;
	verificationTokenId: string | null;
	providerName: string;
	providerMessageId: string | null;
	triggeredByType: "user" | "admin" | "system";
	triggeredByUser: string | null;
	resultStatus: AdminEmailEventStatus;
	providerResponseSummary: string | null;
	errorCode: string | null;
	errorMessage: string | null;
	attemptedAt: string;
	canReplay: boolean;
};

export type AdminTokenSummaryItem = {
	id: string;
	createdAt: string;
	expiresAt: string;
	consumedAt: string | null;
	status: "active" | "expired" | "consumed";
};

export type AdminAuditLogItem = {
	id: string;
	adminUsername: string;
	actionType: string;
	targetSubscriberId: string | null;
	targetEmailEventId: string | null;
	metadata: Record<string, unknown>;
	createdAt: string;
};

export type AdminStaleSubscriberItem = {
	id: string;
	email: string;
	sourceLabel: string | null;
	verificationSentAt: string;
	hoursPending: number;
};

export type AdminOverview = {
	failedEmailEvents: AdminEmailEventItem[];
	stalePendingSubscribers: AdminStaleSubscriberItem[];
	auditLog: AdminAuditLogItem[];
};

export type AdminSubscriberDetail = AdminSubscriberListItem & {
	profile: {
		companyName: string | null;
		businessStage: string | null;
		employeeBand: string | null;
		annualRevenueBand: string | null;
		provinces: string[];
		industries: string[];
		fundingNeeds: string[];
		founderTraits: string[];
		notes: string | null;
	} | null;
	emailTimeline: AdminEmailEventItem[];
	resendHistory: AdminEmailEventItem[];
	tokenSummary: AdminTokenSummaryItem[];
};

type AdminSubscriberRow = {
	id: string;
	email: string;
	status: AdminSubscriberStatus;
	source_label: string | null;
	created_at: string;
	updated_at: string;
	verification_sent_at: string | null;
	verified_at: string | null;
	unsubscribed_at: string | null;
	last_delivery_status: AdminEmailEventStatus | null;
	last_delivery_time: string | null;
	last_delivery_error: string | null;
};

type SubscriberProfileRow = {
	company_name: string | null;
	provinces_json: string;
	industries_json: string;
	business_stage: string | null;
	employee_band: string | null;
	annual_revenue_band: string | null;
	funding_needs_json: string;
	founder_traits_json: string;
	notes: string | null;
};

type EmailEventRow = {
	id: string;
	email_type: string;
	recipient_email: string;
	subscriber_id: string | null;
	verification_token_id: string | null;
	provider_name: string;
	provider_message_id: string | null;
	triggered_by_type: "user" | "admin" | "system";
	triggered_by_user: string | null;
	result_status: AdminEmailEventStatus;
	provider_response_summary: string | null;
	error_code: string | null;
	error_message: string | null;
	attempted_at: string;
};

type TokenSummaryRow = {
	id: string;
	created_at: string;
	expires_at: string;
	consumed_at: string | null;
};

type AuditRow = {
	id: string;
	admin_username: string;
	action_type: string;
	target_subscriber_id: string | null;
	target_email_event_id: string | null;
	metadata_json: string;
	created_at: string;
};

export type ListSubscribersOptions = {
	q?: string;
	status?: "all" | AdminSubscriberStatus;
	limit?: number;
	offset?: number;
};

function parseJsonArray(value: string): string[] {
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
	} catch {
		return [];
	}
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

function mapListItem(row: AdminSubscriberRow): AdminSubscriberListItem {
	return {
		id: row.id,
		email: row.email,
		status: row.status,
		sourceLabel: row.source_label,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		verificationSentAt: row.verification_sent_at,
		verifiedAt: row.verified_at,
		unsubscribedAt: row.unsubscribed_at,
		lastDeliveryStatus: row.last_delivery_status,
		lastDeliveryTime: row.last_delivery_time,
		lastDeliveryError: row.last_delivery_error,
	};
}

function mapEmailEvent(row: EmailEventRow): AdminEmailEventItem {
	return {
		id: row.id,
		emailType: row.email_type,
		recipientEmail: row.recipient_email,
		subscriberId: row.subscriber_id,
		verificationTokenId: row.verification_token_id,
		providerName: row.provider_name,
		providerMessageId: row.provider_message_id,
		triggeredByType: row.triggered_by_type,
		triggeredByUser: row.triggered_by_user,
		resultStatus: row.result_status,
		providerResponseSummary: row.provider_response_summary,
		errorCode: row.error_code,
		errorMessage: row.error_message,
		attemptedAt: row.attempted_at,
		canReplay:
			row.result_status === "failed" && (row.email_type === "verification" || row.email_type === "admin_test"),
	};
}

function mapTokenSummary(row: TokenSummaryRow): AdminTokenSummaryItem {
	let status: AdminTokenSummaryItem["status"] = "active";

	if (row.consumed_at) {
		status = "consumed";
	} else if (Date.parse(row.expires_at) < Date.now()) {
		status = "expired";
	}

	return {
		id: row.id,
		createdAt: row.created_at,
		expiresAt: row.expires_at,
		consumedAt: row.consumed_at,
		status,
	};
}

function mapAuditRow(row: AuditRow): AdminAuditLogItem {
	return {
		id: row.id,
		adminUsername: row.admin_username,
		actionType: row.action_type,
		targetSubscriberId: row.target_subscriber_id,
		targetEmailEventId: row.target_email_event_id,
		metadata: parseJsonObject(row.metadata_json),
		createdAt: row.created_at,
	};
}

export async function listAdminSubscribers(options: ListSubscribersOptions = {}): Promise<{
	items: AdminSubscriberListItem[];
	total: number;
}> {
	const db = await getFundingDb();
	const filters: string[] = [];
	const params: unknown[] = [];

	if (options.q) {
		filters.push("LOWER(s.email) LIKE ?");
		params.push(`%${normalizeEmailAddress(options.q)}%`);
	}

	if (options.status && options.status !== "all") {
		filters.push("s.status = ?");
		params.push(options.status);
	}

	const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
	const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
	const offset = Math.max(options.offset ?? 0, 0);

	const [countResult, rowsResult] = await db.batch([
		db.prepare(`SELECT COUNT(*) AS total FROM subscribers s ${whereClause}`).bind(...params),
		db
			.prepare(
				`
					SELECT
						s.id,
						s.email,
						s.status,
						s.source_label,
						s.created_at,
						s.updated_at,
						s.verification_sent_at,
						s.verified_at,
						s.unsubscribed_at,
						(
							SELECT ee.result_status
							FROM email_events ee
							WHERE ee.subscriber_id = s.id AND ee.email_type = 'verification'
							ORDER BY ee.attempted_at DESC
							LIMIT 1
						) AS last_delivery_status,
						(
							SELECT ee.attempted_at
							FROM email_events ee
							WHERE ee.subscriber_id = s.id AND ee.email_type = 'verification'
							ORDER BY ee.attempted_at DESC
							LIMIT 1
						) AS last_delivery_time,
						(
							SELECT ee.error_message
							FROM email_events ee
							WHERE ee.subscriber_id = s.id AND ee.email_type = 'verification'
							ORDER BY ee.attempted_at DESC
							LIMIT 1
						) AS last_delivery_error
					FROM subscribers s
					${whereClause}
					ORDER BY s.updated_at DESC, s.created_at DESC
					LIMIT ? OFFSET ?
				`
			)
			.bind(...params, limit, offset),
	]);

	const totalRow = countResult.results[0] as { total?: number } | undefined;

	return {
		total: totalRow?.total ?? 0,
		items: rowsResult.results.map((row) => mapListItem(row as unknown as AdminSubscriberRow)),
	};
}

export async function getAdminSubscriberDetail(subscriberId: string): Promise<AdminSubscriberDetail | null> {
	const db = await getFundingDb();
	const [subscriberResult, profileResult, timelineResult, tokenResult] = await db.batch([
		db
			.prepare(
				`
					SELECT
						s.id,
						s.email,
						s.status,
						s.source_label,
						s.created_at,
						s.updated_at,
						s.verification_sent_at,
						s.verified_at,
						s.unsubscribed_at,
						(
							SELECT ee.result_status
							FROM email_events ee
							WHERE ee.subscriber_id = s.id AND ee.email_type = 'verification'
							ORDER BY ee.attempted_at DESC
							LIMIT 1
						) AS last_delivery_status,
						(
							SELECT ee.attempted_at
							FROM email_events ee
							WHERE ee.subscriber_id = s.id AND ee.email_type = 'verification'
							ORDER BY ee.attempted_at DESC
							LIMIT 1
						) AS last_delivery_time,
						(
							SELECT ee.error_message
							FROM email_events ee
							WHERE ee.subscriber_id = s.id AND ee.email_type = 'verification'
							ORDER BY ee.attempted_at DESC
							LIMIT 1
						) AS last_delivery_error
					FROM subscribers s
					WHERE s.id = ?
				`
			)
			.bind(subscriberId),
		db.prepare("SELECT * FROM subscriber_profiles WHERE subscriber_id = ?").bind(subscriberId),
		db
			.prepare(
				`
					SELECT
						id,
						email_type,
						recipient_email,
						subscriber_id,
						verification_token_id,
						provider_name,
						provider_message_id,
						triggered_by_type,
						triggered_by_user,
						result_status,
						provider_response_summary,
						error_code,
						error_message,
						attempted_at
					FROM email_events
					WHERE subscriber_id = ?
					ORDER BY attempted_at DESC
					LIMIT 30
				`
			)
			.bind(subscriberId),
		db
			.prepare(
				`
					SELECT id, created_at, expires_at, consumed_at
					FROM email_verification_tokens
					WHERE subscriber_id = ?
					ORDER BY created_at DESC
					LIMIT 15
				`
			)
			.bind(subscriberId),
	]);

	const subscriberRow = subscriberResult.results[0] as unknown as AdminSubscriberRow | undefined;
	if (!subscriberRow) {
		return null;
	}

	const profileRow = profileResult.results[0] as unknown as SubscriberProfileRow | undefined;
	const timeline = timelineResult.results.map((row) => mapEmailEvent(row as unknown as EmailEventRow));

	return {
		...mapListItem(subscriberRow),
		profile: profileRow
			? {
					companyName: profileRow.company_name,
					businessStage: profileRow.business_stage,
					employeeBand: profileRow.employee_band,
					annualRevenueBand: profileRow.annual_revenue_band,
					provinces: parseJsonArray(profileRow.provinces_json),
					industries: parseJsonArray(profileRow.industries_json),
					fundingNeeds: parseJsonArray(profileRow.funding_needs_json),
					founderTraits: parseJsonArray(profileRow.founder_traits_json),
					notes: profileRow.notes,
				}
			: null,
		emailTimeline: timeline,
		resendHistory: timeline.filter(
			(event) => event.emailType === "verification" && event.triggeredByType === "admin"
		),
		tokenSummary: tokenResult.results.map((row) => mapTokenSummary(row as unknown as TokenSummaryRow)),
	};
}

export async function getAdminOverview(options?: {
	staleHours?: number;
	failedLimit?: number;
	staleLimit?: number;
	auditLimit?: number;
}): Promise<AdminOverview> {
	const db = await getFundingDb();
	const staleHours = Math.max(options?.staleHours ?? 72, 1);
	const failedLimit = Math.min(Math.max(options?.failedLimit ?? 20, 1), 100);
	const staleLimit = Math.min(Math.max(options?.staleLimit ?? 20, 1), 100);
	const auditLimit = Math.min(Math.max(options?.auditLimit ?? 20, 1), 100);
	const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString();

	const [failedResult, staleResult, auditResult] = await db.batch([
		db
			.prepare(
				`
					SELECT
						id,
						email_type,
						recipient_email,
						subscriber_id,
						verification_token_id,
						provider_name,
						provider_message_id,
						triggered_by_type,
						triggered_by_user,
						result_status,
						provider_response_summary,
						error_code,
						error_message,
						attempted_at
					FROM email_events
					WHERE result_status = 'failed'
					ORDER BY attempted_at DESC
					LIMIT ?
				`
			)
			.bind(failedLimit),
		db
			.prepare(
				`
					SELECT
						id,
						email,
						source_label,
						verification_sent_at
					FROM subscribers
					WHERE
						status = 'pending_verification'
						AND verification_sent_at IS NOT NULL
						AND verification_sent_at < ?
					ORDER BY verification_sent_at ASC
					LIMIT ?
				`
			)
			.bind(cutoff, staleLimit),
		db
			.prepare(
				`
					SELECT
						id,
						admin_username,
						action_type,
						target_subscriber_id,
						target_email_event_id,
						metadata_json,
						created_at
					FROM admin_audit_log
					ORDER BY created_at DESC
					LIMIT ?
				`
			)
			.bind(auditLimit),
	]);

	return {
		failedEmailEvents: failedResult.results.map((row) => mapEmailEvent(row as unknown as EmailEventRow)),
		stalePendingSubscribers: staleResult.results.map((row) => {
			const typed = row as {
				id: string;
				email: string;
				source_label: string | null;
				verification_sent_at: string;
			};
			return {
				id: typed.id,
				email: typed.email,
				sourceLabel: typed.source_label,
				verificationSentAt: typed.verification_sent_at,
				hoursPending: Math.max(
					1,
					Math.floor((Date.now() - Date.parse(typed.verification_sent_at)) / (1000 * 60 * 60))
				),
			};
		}),
		auditLog: auditResult.results.map((row) => mapAuditRow(row as unknown as AuditRow)),
	};
}
