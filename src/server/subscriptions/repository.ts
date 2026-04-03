import { getFundingDb } from "@/server/cloudflare/context";
import { createVerificationToken, hashVerificationToken } from "@/server/subscriptions/token";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "@/server/subscriptions/unsubscribe";

const VERIFICATION_TTL_HOURS = 24;

type SubscriberRow = {
	id: string;
	email: string;
	status: "pending_verification" | "verified" | "unsubscribed";
};

type VerificationLookupRow = {
	token_id: string;
	subscriber_id: string;
	expires_at: string;
	consumed_at: string | null;
	subscriber_status: SubscriberRow["status"];
};

type SubscriberWithVerificationRow = SubscriberRow & {
	verification_sent_at: string | null;
};

type DeliveryInsertArgs = {
	subscriberId: string;
	status: "sent" | "failed";
	providerMessageId?: string;
	errorMessage?: string;
	sentAt?: string;
};

export type SubscriptionRequestResult =
	| { status: "verification_sent"; email: string; verificationUrl?: string }
	| { status: "already_verified"; email: string };

export type VerificationResult =
	| "verified"
	| "already-verified"
	| "expired"
	| "invalid"
	| "missing";

export type UnsubscribeResult =
	| "unsubscribed"
	| "already-unsubscribed"
	| "invalid"
	| "missing";

export function normalizeEmailAddress(email: string): string {
	return email.trim().toLowerCase();
}

function isEmailLike(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function nowIso(): string {
	return new Date().toISOString();
}

function expiresAtIso(): string {
	return new Date(Date.now() + VERIFICATION_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

async function insertVerificationDelivery(args: DeliveryInsertArgs): Promise<void> {
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
				VALUES (?, ?, NULL, 'verification', ?, ?, ?, ?, ?)
			`
		)
		.bind(
			crypto.randomUUID(),
			args.subscriberId,
			args.status,
			args.providerMessageId ?? null,
			args.errorMessage ?? null,
			args.sentAt ?? null,
			createdAt
		)
		.run();
}

async function getSubscriberById(subscriberId: string): Promise<SubscriberWithVerificationRow | null> {
	const db = await getFundingDb();
	return db
		.prepare("SELECT id, email, status, verification_sent_at FROM subscribers WHERE id = ?")
		.bind(subscriberId)
		.first<SubscriberWithVerificationRow>();
}

async function issueVerificationForSubscriber(input: {
	subscriberId: string;
	email: string;
	baseUrl: string;
	sendVerificationEmail: (args: {
		email: string;
		verificationUrl: string;
		unsubscribeUrl: string;
	}) => Promise<{ providerMessageId?: string }>;
	updateStatusToPending?: boolean;
}): Promise<{ verificationUrl: string }> {
	const db = await getFundingDb();
	const timestamp = nowIso();

	if (input.updateStatusToPending) {
		await db
			.prepare(
				`
					UPDATE subscribers
					SET
						status = 'pending_verification',
						grant_updates_enabled = 1,
						verification_sent_at = ?,
						unsubscribed_at = NULL,
						updated_at = ?
					WHERE id = ?
				`
			)
			.bind(timestamp, timestamp, input.subscriberId)
			.run();
	} else {
		await db
			.prepare(
				`
					UPDATE subscribers
					SET
						verification_sent_at = ?,
						updated_at = ?
					WHERE id = ?
				`
			)
			.bind(timestamp, timestamp, input.subscriberId)
			.run();
	}

	const rawToken = createVerificationToken();
	const tokenHash = await hashVerificationToken(rawToken);
	const verificationUrl = new URL("/api/verify", input.baseUrl);
	verificationUrl.searchParams.set("token", rawToken);
	const unsubscribeToken = await createUnsubscribeToken({
		subscriberId: input.subscriberId,
		email: input.email,
	});
	const unsubscribeUrl = new URL("/api/unsubscribe", input.baseUrl);
	unsubscribeUrl.searchParams.set("token", unsubscribeToken);

	await db
		.prepare(
			`
				INSERT INTO email_verification_tokens (
					id,
					subscriber_id,
					token_hash,
					expires_at,
					created_at
				)
				VALUES (?, ?, ?, ?, ?)
			`
		)
		.bind(crypto.randomUUID(), input.subscriberId, tokenHash, expiresAtIso(), timestamp)
		.run();

	try {
		const delivery = await input.sendVerificationEmail({
			email: input.email,
			verificationUrl: verificationUrl.toString(),
			unsubscribeUrl: unsubscribeUrl.toString(),
		});

		await insertVerificationDelivery({
			subscriberId: input.subscriberId,
			status: "sent",
			providerMessageId: delivery.providerMessageId,
			sentAt: timestamp,
		});
	} catch (error) {
		await insertVerificationDelivery({
			subscriberId: input.subscriberId,
			status: "failed",
			errorMessage: error instanceof Error ? error.message : "Verification email failed.",
		});
		throw error;
	}

	return {
		verificationUrl: verificationUrl.toString(),
	};
}

export async function createOrRefreshSubscriber(input: {
	email: string;
	sourceLabel?: string;
	baseUrl: string;
	shouldExposeVerificationUrl?: boolean;
	sendVerificationEmail: (args: {
		email: string;
		verificationUrl: string;
		unsubscribeUrl: string;
	}) => Promise<{ providerMessageId?: string }>;
}): Promise<SubscriptionRequestResult> {
	const email = normalizeEmailAddress(input.email);

	if (!isEmailLike(email)) {
		throw new Error("Please enter a valid email address.");
	}

	const db = await getFundingDb();
	const existing = await db
		.prepare("SELECT id, email, status FROM subscribers WHERE email = ?")
		.bind(email)
		.first<SubscriberRow>();

	if (existing?.status === "verified") {
		return {
			status: "already_verified",
			email,
		};
	}

	const subscriberId = existing?.id ?? crypto.randomUUID();
	const timestamp = nowIso();

	await db
		.prepare(
			`
				INSERT INTO subscribers (
					id,
					email,
					status,
					source_label,
					verification_sent_at,
					created_at,
					updated_at
				)
				VALUES (?, ?, 'pending_verification', ?, ?, ?, ?)
				ON CONFLICT(email) DO UPDATE SET
					status = 'pending_verification',
					source_label = COALESCE(excluded.source_label, subscribers.source_label),
					verification_sent_at = excluded.verification_sent_at,
					unsubscribed_at = NULL,
					updated_at = excluded.updated_at
			`
		)
		.bind(subscriberId, email, input.sourceLabel ?? "site-signup", timestamp, timestamp, timestamp)
		.run();

	const delivery = await issueVerificationForSubscriber({
		subscriberId,
		email,
		baseUrl: input.baseUrl,
		updateStatusToPending: false,
		sendVerificationEmail: input.sendVerificationEmail,
	});

	return {
		status: "verification_sent",
		email,
		verificationUrl: input.shouldExposeVerificationUrl ? delivery.verificationUrl : undefined,
	};
}

export async function consumeVerificationToken(token: string | null): Promise<VerificationResult> {
	if (!token) {
		return "missing";
	}

	const db = await getFundingDb();
	const tokenHash = await hashVerificationToken(token);
	const tokenRow = await db
		.prepare(
			`
				SELECT
					email_verification_tokens.id AS token_id,
					email_verification_tokens.subscriber_id AS subscriber_id,
					email_verification_tokens.expires_at AS expires_at,
					email_verification_tokens.consumed_at AS consumed_at,
					subscribers.status AS subscriber_status
				FROM email_verification_tokens
				INNER JOIN subscribers
					ON subscribers.id = email_verification_tokens.subscriber_id
				WHERE email_verification_tokens.token_hash = ?
			`
		)
		.bind(tokenHash)
		.first<VerificationLookupRow>();

	if (!tokenRow) {
		return "invalid";
	}

	if (tokenRow.subscriber_status === "verified") {
		return "already-verified";
	}

	if (tokenRow.consumed_at) {
		return "invalid";
	}

	if (Date.parse(tokenRow.expires_at) < Date.now()) {
		return "expired";
	}

	const timestamp = nowIso();

	await db.batch([
		db
			.prepare(
				`
					UPDATE email_verification_tokens
					SET consumed_at = ?
					WHERE id = ?
				`
			)
			.bind(timestamp, tokenRow.token_id),
		db
			.prepare(
				`
					UPDATE subscribers
					SET
						status = 'verified',
						verified_at = ?,
						updated_at = ?
					WHERE id = ?
				`
			)
			.bind(timestamp, timestamp, tokenRow.subscriber_id),
	]);

	return "verified";
}

export async function unsubscribeFromToken(token: string | null): Promise<UnsubscribeResult> {
	if (!token) {
		return "missing";
	}

	const payload = await verifyUnsubscribeToken(token);

	if (!payload) {
		return "invalid";
	}

	const db = await getFundingDb();
	const subscriber = await db
		.prepare("SELECT status FROM subscribers WHERE id = ? AND email = ?")
		.bind(payload.subscriberId, normalizeEmailAddress(payload.email))
		.first<{ status: SubscriberRow["status"] }>();

	if (!subscriber) {
		return "invalid";
	}

	if (subscriber.status === "unsubscribed") {
		return "already-unsubscribed";
	}

	const timestamp = nowIso();

	await db
		.prepare(
			`
				UPDATE subscribers
				SET
					status = 'unsubscribed',
					grant_updates_enabled = 0,
					unsubscribed_at = ?,
					updated_at = ?
				WHERE id = ?
			`
		)
		.bind(timestamp, timestamp, payload.subscriberId)
		.run();

	return "unsubscribed";
}

export async function resendVerificationForSubscriber(input: {
	subscriberId: string;
	baseUrl: string;
	sendVerificationEmail: (args: {
		email: string;
		verificationUrl: string;
		unsubscribeUrl: string;
	}) => Promise<{ providerMessageId?: string }>;
}): Promise<void> {
	const subscriber = await getSubscriberById(input.subscriberId);

	if (!subscriber) {
		throw new Error("NOT_FOUND");
	}

	if (subscriber.status !== "pending_verification") {
		throw new Error("Only pending subscribers can receive another verification email.");
	}

	await issueVerificationForSubscriber({
		subscriberId: subscriber.id,
		email: subscriber.email,
		baseUrl: input.baseUrl,
		sendVerificationEmail: input.sendVerificationEmail,
		updateStatusToPending: false,
	});
}

export async function unsubscribeSubscriberById(subscriberId: string): Promise<void> {
	const subscriber = await getSubscriberById(subscriberId);

	if (!subscriber) {
		throw new Error("NOT_FOUND");
	}

	const db = await getFundingDb();
	const timestamp = nowIso();

	await db
		.prepare(
			`
				UPDATE subscribers
				SET
					status = 'unsubscribed',
					grant_updates_enabled = 0,
					unsubscribed_at = ?,
					updated_at = ?
				WHERE id = ?
			`
		)
		.bind(timestamp, timestamp, subscriberId)
		.run();
}

export async function deleteSubscriberById(subscriberId: string): Promise<void> {
	const subscriber = await getSubscriberById(subscriberId);

	if (!subscriber) {
		throw new Error("NOT_FOUND");
	}

	const db = await getFundingDb();
	await db.prepare("DELETE FROM subscribers WHERE id = ?").bind(subscriberId).run();
}
