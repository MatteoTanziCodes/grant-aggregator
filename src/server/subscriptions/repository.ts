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

export async function createOrRefreshSubscriber(input: {
	email: string;
	sourceLabel?: string;
	baseUrl: string;
	shouldExposeVerificationUrl?: boolean;
	sendVerificationEmail: (args: {
		email: string;
		verificationUrl: string;
		unsubscribeUrl: string;
	}) => Promise<void>;
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

	const rawToken = createVerificationToken();
	const tokenHash = await hashVerificationToken(rawToken);
	const verificationUrl = new URL("/api/verify", input.baseUrl);
	verificationUrl.searchParams.set("token", rawToken);
	const unsubscribeToken = await createUnsubscribeToken({
		subscriberId,
		email,
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
		.bind(crypto.randomUUID(), subscriberId, tokenHash, expiresAtIso(), timestamp)
		.run();

	await input.sendVerificationEmail({
		email,
		verificationUrl: verificationUrl.toString(),
		unsubscribeUrl: unsubscribeUrl.toString(),
	});

	return {
		status: "verification_sent",
		email,
		verificationUrl: input.shouldExposeVerificationUrl ? verificationUrl.toString() : undefined,
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
