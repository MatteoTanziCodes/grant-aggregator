import { getFundingDb } from "@/server/cloudflare/context";

export type EmailEventType = "verification" | "grant_update_digest" | "grant_update_alert" | "admin_test";
export type EmailEventActorType = "user" | "admin" | "system";
export type EmailEventStatus = "queued" | "sent" | "failed" | "skipped";

export type CreateEmailEventArgs = {
	emailType: EmailEventType;
	recipientEmail: string;
	subscriberId?: string | null;
	verificationTokenId?: string | null;
	opportunityId?: string | null;
	providerName?: string;
	providerMessageId?: string | null;
	triggeredByType: EmailEventActorType;
	triggeredByUser?: string | null;
	resultStatus: EmailEventStatus;
	providerResponseSummary?: string | null;
	errorCode?: string | null;
	errorMessage?: string | null;
	attemptedAt?: string;
};

function nowIso(): string {
	return new Date().toISOString();
}

function truncate(value: string | null | undefined, maxLength = 1500): string | null {
	if (!value) {
		return null;
	}

	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export async function createEmailEvent(args: CreateEmailEventArgs): Promise<string> {
	const db = await getFundingDb();
	const id = crypto.randomUUID();
	const attemptedAt = args.attemptedAt ?? nowIso();

	await db
		.prepare(
			`
				INSERT INTO email_events (
					id,
					email_type,
					recipient_email,
					subscriber_id,
					verification_token_id,
					opportunity_id,
					provider_name,
					provider_message_id,
					triggered_by_type,
					triggered_by_user,
					result_status,
					provider_response_summary,
					error_code,
					error_message,
					attempted_at,
					created_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`
		)
		.bind(
			id,
			args.emailType,
			args.recipientEmail,
			args.subscriberId ?? null,
			args.verificationTokenId ?? null,
			args.opportunityId ?? null,
			args.providerName ?? "resend",
			args.providerMessageId ?? null,
			args.triggeredByType,
			args.triggeredByUser ?? null,
			args.resultStatus,
			truncate(args.providerResponseSummary),
			args.errorCode ?? null,
			truncate(args.errorMessage),
			attemptedAt,
			nowIso()
		)
		.run();

	return id;
}
