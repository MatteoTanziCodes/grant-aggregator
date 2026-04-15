import { getFundingDb } from "@/server/cloudflare/context";

type AuditArgs = {
	adminUsername: string;
	actionType: string;
	targetSubscriberId?: string | null;
	targetEmailEventId?: string | null;
	metadata?: Record<string, unknown>;
};

function nowIso(): string {
	return new Date().toISOString();
}

export async function logAdminAudit(args: AuditArgs): Promise<void> {
	const db = await getFundingDb();

	await db
		.prepare(
			`
				INSERT INTO admin_audit_log (
					id,
					admin_username,
					action_type,
					target_subscriber_id,
					target_email_event_id,
					metadata_json,
					created_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`
		)
		.bind(
			crypto.randomUUID(),
			args.adminUsername,
			args.actionType,
			args.targetSubscriberId ?? null,
			args.targetEmailEventId ?? null,
			JSON.stringify(args.metadata ?? {}),
			nowIso()
		)
		.run();
}
