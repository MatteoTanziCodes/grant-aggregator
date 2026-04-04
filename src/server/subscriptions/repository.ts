import { logAdminAudit } from "@/server/admin/audit";
import { getFundingDb } from "@/server/cloudflare/context";
import { createEmailEvent, type EmailEventActorType } from "@/server/email-events/repository";
import { createVerificationToken, hashVerificationToken } from "@/server/subscriptions/token";
import {
	createUnsubscribeToken,
	verifyUnsubscribeToken,
} from "@/server/subscriptions/unsubscribe";
import {
	sendAdminTestEmail,
	type DeliveryResult,
	toDeliveryErrorDetails,
} from "@/server/subscriptions/email";

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
	status: "queued" | "sent" | "failed";
	providerMessageId?: string;
	errorMessage?: string;
	sentAt?: string;
};

type VerificationActor = {
	type: EmailEventActorType;
	username?: string;
};

type SendVerificationEmailFn = (args: {
	email: string;
	verificationUrl: string;
	unsubscribeUrl: string;
}) => Promise<DeliveryResult>;

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

function legacyDeliveryStatusFromResult(resultStatus: DeliveryResult["resultStatus"]): "queued" | "sent" {
	return resultStatus === "skipped" ? "queued" : "sent";
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
	sendVerificationEmail: SendVerificationEmailFn;
	updateStatusToPending?: boolean;
	actor: VerificationActor;
}): Promise<{ verificationUrl: string; verificationTokenId: string; emailEventId: string }> {
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
	const verificationTokenId = crypto.randomUUID();
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
		.bind(verificationTokenId, input.subscriberId, tokenHash, expiresAtIso(), timestamp)
		.run();

	try {
		const delivery = await input.sendVerificationEmail({
			email: input.email,
			verificationUrl: verificationUrl.toString(),
			unsubscribeUrl: unsubscribeUrl.toString(),
		});

		await insertVerificationDelivery({
			subscriberId: input.subscriberId,
			status: legacyDeliveryStatusFromResult(delivery.resultStatus),
			providerMessageId: delivery.providerMessageId,
			sentAt: timestamp,
		});

		const emailEventId = await createEmailEvent({
			emailType: "verification",
			recipientEmail: input.email,
			subscriberId: input.subscriberId,
			verificationTokenId,
			providerName: delivery.providerName,
			providerMessageId: delivery.providerMessageId,
			triggeredByType: input.actor.type,
			triggeredByUser: input.actor.username ?? null,
			resultStatus: delivery.resultStatus,
			providerResponseSummary: delivery.providerResponseSummary,
			attemptedAt: timestamp,
		});

		return {
			verificationUrl: verificationUrl.toString(),
			verificationTokenId,
			emailEventId,
		};
	} catch (error) {
		const failure = toDeliveryErrorDetails(error);
		await insertVerificationDelivery({
			subscriberId: input.subscriberId,
			status: "failed",
			errorMessage: failure.errorMessage,
		});

		const emailEventId = await createEmailEvent({
			emailType: "verification",
			recipientEmail: input.email,
			subscriberId: input.subscriberId,
			verificationTokenId,
			providerName: failure.providerName,
			triggeredByType: input.actor.type,
			triggeredByUser: input.actor.username ?? null,
			resultStatus: "failed",
			providerResponseSummary: failure.providerResponseSummary,
			errorCode: failure.errorCode,
			errorMessage: failure.errorMessage,
			attemptedAt: timestamp,
		});

		if (input.actor.type === "admin" && input.actor.username) {
			await logAdminAudit({
				adminUsername: input.actor.username,
				actionType: "verification_resend_failed",
				targetSubscriberId: input.subscriberId,
				targetEmailEventId: emailEventId,
				metadata: {
					email: input.email,
					errorCode: failure.errorCode,
				},
			});
		}

		throw error;
	}
}

export async function createOrRefreshSubscriber(input: {
	email: string;
	sourceLabel?: string;
	baseUrl: string;
	shouldExposeVerificationUrl?: boolean;
	sendVerificationEmail: SendVerificationEmailFn;
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
		actor: { type: "user" },
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
	sendVerificationEmail: SendVerificationEmailFn;
	adminUsername: string;
}): Promise<void> {
	const subscriber = await getSubscriberById(input.subscriberId);

	if (!subscriber) {
		throw new Error("NOT_FOUND");
	}

	if (subscriber.status !== "pending_verification") {
		throw new Error("Only pending subscribers can receive another verification email.");
	}

	const result = await issueVerificationForSubscriber({
		subscriberId: subscriber.id,
		email: subscriber.email,
		baseUrl: input.baseUrl,
		sendVerificationEmail: input.sendVerificationEmail,
		updateStatusToPending: false,
		actor: { type: "admin", username: input.adminUsername },
	});

	await logAdminAudit({
		adminUsername: input.adminUsername,
		actionType: "verification_resend",
		targetSubscriberId: subscriber.id,
		targetEmailEventId: result.emailEventId,
		metadata: {
			email: subscriber.email,
			verificationTokenId: result.verificationTokenId,
		},
	});
}

export async function unsubscribeSubscriberById(input: {
	subscriberId: string;
	adminUsername: string;
}): Promise<void> {
	const subscriber = await getSubscriberById(input.subscriberId);

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
		.bind(timestamp, timestamp, input.subscriberId)
		.run();

	await logAdminAudit({
		adminUsername: input.adminUsername,
		actionType: "force_unsubscribe",
		targetSubscriberId: input.subscriberId,
		metadata: {
			email: subscriber.email,
		},
	});
}

export async function deleteSubscriberById(input: {
	subscriberId: string;
	adminUsername: string;
}): Promise<void> {
	const subscriber = await getSubscriberById(input.subscriberId);

	if (!subscriber) {
		throw new Error("NOT_FOUND");
	}

	await logAdminAudit({
		adminUsername: input.adminUsername,
		actionType: "hard_delete_requested",
		targetSubscriberId: input.subscriberId,
		metadata: {
			email: subscriber.email,
		},
	});

	const db = await getFundingDb();
	await db.prepare("DELETE FROM subscribers WHERE id = ?").bind(input.subscriberId).run();

	await logAdminAudit({
		adminUsername: input.adminUsername,
		actionType: "hard_delete_completed",
		metadata: {
			deletedSubscriberId: input.subscriberId,
			email: subscriber.email,
		},
	});
}

export async function sendAdminTestEmailToRecipient(input: {
	email: string;
	adminUsername: string;
}): Promise<{ emailEventId: string }> {
	const email = normalizeEmailAddress(input.email);

	if (!isEmailLike(email)) {
		throw new Error("Please enter a valid email address.");
	}

	const timestamp = nowIso();

	try {
		const delivery = await sendAdminTestEmail({
			email,
			adminUsername: input.adminUsername,
		});

		const emailEventId = await createEmailEvent({
			emailType: "admin_test",
			recipientEmail: email,
			providerName: delivery.providerName,
			providerMessageId: delivery.providerMessageId,
			triggeredByType: "admin",
			triggeredByUser: input.adminUsername,
			resultStatus: delivery.resultStatus,
			providerResponseSummary: delivery.providerResponseSummary,
			attemptedAt: timestamp,
		});

		await logAdminAudit({
			adminUsername: input.adminUsername,
			actionType: "manual_test_send",
			targetEmailEventId: emailEventId,
			metadata: {
				email,
			},
		});

		return { emailEventId };
	} catch (error) {
		const failure = toDeliveryErrorDetails(error);
		const emailEventId = await createEmailEvent({
			emailType: "admin_test",
			recipientEmail: email,
			providerName: failure.providerName,
			triggeredByType: "admin",
			triggeredByUser: input.adminUsername,
			resultStatus: "failed",
			providerResponseSummary: failure.providerResponseSummary,
			errorCode: failure.errorCode,
			errorMessage: failure.errorMessage,
			attemptedAt: timestamp,
		});

		await logAdminAudit({
			adminUsername: input.adminUsername,
			actionType: "manual_test_send_failed",
			targetEmailEventId: emailEventId,
			metadata: {
				email,
				errorCode: failure.errorCode,
			},
		});

		throw error;
	}
}

export async function replayEmailEventById(input: {
	emailEventId: string;
	baseUrl: string;
	sendVerificationEmail: SendVerificationEmailFn;
	adminUsername: string;
}): Promise<void> {
	const db = await getFundingDb();
	const event = await db
		.prepare(
			`
				SELECT
					id,
					email_type,
					recipient_email,
					subscriber_id
				FROM email_events
				WHERE id = ?
			`
		)
		.bind(input.emailEventId)
		.first<{
			id: string;
			email_type: "verification" | "admin_test";
			recipient_email: string;
			subscriber_id: string | null;
		}>();

	if (!event) {
		throw new Error("NOT_FOUND");
	}

	if (event.email_type === "verification") {
		if (!event.subscriber_id) {
			throw new Error("Verification event is missing a subscriber reference.");
		}

		await resendVerificationForSubscriber({
			subscriberId: event.subscriber_id,
			baseUrl: input.baseUrl,
			sendVerificationEmail: input.sendVerificationEmail,
			adminUsername: input.adminUsername,
		});

		await logAdminAudit({
			adminUsername: input.adminUsername,
			actionType: "replay_failed_email",
			targetSubscriberId: event.subscriber_id,
			targetEmailEventId: input.emailEventId,
			metadata: {
				emailType: event.email_type,
				recipientEmail: event.recipient_email,
			},
		});

		return;
	}

	if (event.email_type === "admin_test") {
		await sendAdminTestEmailToRecipient({
			email: event.recipient_email,
			adminUsername: input.adminUsername,
		});

		await logAdminAudit({
			adminUsername: input.adminUsername,
			targetEmailEventId: input.emailEventId,
			actionType: "replay_failed_email",
			metadata: {
				emailType: event.email_type,
				recipientEmail: event.recipient_email,
			},
		});

		return;
	}

	throw new Error("Replay is only available for verification and admin test emails.");
}
