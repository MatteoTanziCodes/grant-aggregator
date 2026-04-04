import { getFundingDb } from "@/server/cloudflare/context";

export class RateLimitError extends Error {
	retryAfterSeconds: number;

	constructor(message: string, retryAfterSeconds: number) {
		super(message);
		this.name = "RateLimitError";
		this.retryAfterSeconds = retryAfterSeconds;
	}
}

function nowIso(): string {
	return new Date().toISOString();
}

export async function consumeRateLimit(input: {
	actionKey: string;
	bucketKey: string;
	maxAttempts: number;
	windowSeconds: number;
}): Promise<void> {
	const db = await getFundingDb();
	const now = Date.now();
	const cutoff = new Date(now - input.windowSeconds * 1000).toISOString();

	await db
		.prepare(
			`
				DELETE FROM rate_limit_events
				WHERE action_key = ? AND bucket_key = ? AND created_at < ?
			`
		)
		.bind(input.actionKey, input.bucketKey, cutoff)
		.run();

	const countRow = await db
		.prepare(
			`
				SELECT COUNT(*) AS total
				FROM rate_limit_events
				WHERE action_key = ? AND bucket_key = ? AND created_at >= ?
			`
		)
		.bind(input.actionKey, input.bucketKey, cutoff)
		.first<{ total?: number }>();

	const total = countRow?.total ?? 0;
	if (total >= input.maxAttempts) {
		throw new RateLimitError("Too many requests. Please wait and try again.", input.windowSeconds);
	}

	await db
		.prepare(
			`
				INSERT INTO rate_limit_events (
					id,
					action_key,
					bucket_key,
					created_at
				)
				VALUES (?, ?, ?, ?)
			`
		)
		.bind(crypto.randomUUID(), input.actionKey, input.bucketKey, nowIso())
		.run();
}
