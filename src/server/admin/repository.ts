import { getFundingDb } from "@/server/cloudflare/context";
import { normalizeEmailAddress } from "@/server/subscriptions/repository";

export type AdminSubscriberStatus = "pending_verification" | "verified" | "unsubscribed";

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
	lastDeliveryStatus: string | null;
	lastDeliveryTime: string | null;
	lastDeliveryError: string | null;
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
	recentDeliveries: Array<{
		id: string;
		deliveryKind: string;
		deliveryStatus: string;
		providerMessageId: string | null;
		errorMessage: string | null;
		sentAt: string | null;
		createdAt: string;
	}>;
	tokenSummary: Array<{
		createdAt: string;
		expiresAt: string;
		consumedAt: string | null;
	}>;
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
	last_delivery_status: string | null;
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

type DeliveryRow = {
	id: string;
	delivery_kind: string;
	delivery_status: string;
	provider_message_id: string | null;
	error_message: string | null;
	sent_at: string | null;
	created_at: string;
};

type TokenSummaryRow = {
	created_at: string;
	expires_at: string;
	consumed_at: string | null;
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
							SELECT nd.delivery_status
							FROM notification_deliveries nd
							WHERE nd.subscriber_id = s.id AND nd.delivery_kind = 'verification'
							ORDER BY nd.created_at DESC
							LIMIT 1
						) AS last_delivery_status,
						(
							SELECT COALESCE(nd.sent_at, nd.created_at)
							FROM notification_deliveries nd
							WHERE nd.subscriber_id = s.id AND nd.delivery_kind = 'verification'
							ORDER BY nd.created_at DESC
							LIMIT 1
						) AS last_delivery_time,
						(
							SELECT nd.error_message
							FROM notification_deliveries nd
							WHERE nd.subscriber_id = s.id AND nd.delivery_kind = 'verification'
							ORDER BY nd.created_at DESC
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
	const [subscriberResult, profileResult, deliveriesResult, tokenResult] = await db.batch([
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
							SELECT nd.delivery_status
							FROM notification_deliveries nd
							WHERE nd.subscriber_id = s.id AND nd.delivery_kind = 'verification'
							ORDER BY nd.created_at DESC
							LIMIT 1
						) AS last_delivery_status,
						(
							SELECT COALESCE(nd.sent_at, nd.created_at)
							FROM notification_deliveries nd
							WHERE nd.subscriber_id = s.id AND nd.delivery_kind = 'verification'
							ORDER BY nd.created_at DESC
							LIMIT 1
						) AS last_delivery_time,
						(
							SELECT nd.error_message
							FROM notification_deliveries nd
							WHERE nd.subscriber_id = s.id AND nd.delivery_kind = 'verification'
							ORDER BY nd.created_at DESC
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
						delivery_kind,
						delivery_status,
						provider_message_id,
						error_message,
						sent_at,
						created_at
					FROM notification_deliveries
					WHERE subscriber_id = ?
					ORDER BY created_at DESC
					LIMIT 10
				`
			)
			.bind(subscriberId),
		db
			.prepare(
				`
					SELECT created_at, expires_at, consumed_at
					FROM email_verification_tokens
					WHERE subscriber_id = ?
					ORDER BY created_at DESC
					LIMIT 5
				`
			)
			.bind(subscriberId),
	]);

	const subscriberRow = subscriberResult.results[0] as unknown as AdminSubscriberRow | undefined;
	if (!subscriberRow) {
		return null;
	}

	const profileRow = profileResult.results[0] as unknown as SubscriberProfileRow | undefined;

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
		recentDeliveries: deliveriesResult.results.map((row) => {
			const typed = row as unknown as DeliveryRow;
			return {
				id: typed.id,
				deliveryKind: typed.delivery_kind,
				deliveryStatus: typed.delivery_status,
				providerMessageId: typed.provider_message_id,
				errorMessage: typed.error_message,
				sentAt: typed.sent_at,
				createdAt: typed.created_at,
			};
		}),
		tokenSummary: tokenResult.results.map((row) => {
			const typed = row as unknown as TokenSummaryRow;
			return {
				createdAt: typed.created_at,
				expiresAt: typed.expires_at,
				consumedAt: typed.consumed_at,
			};
		}),
	};
}

export async function deleteSubscriber(subscriberId: string): Promise<void> {
	const db = await getFundingDb();
	await db.prepare("DELETE FROM subscribers WHERE id = ?").bind(subscriberId).run();
}
