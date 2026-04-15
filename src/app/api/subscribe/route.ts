import { NextResponse } from "next/server";
import { getCloudflareEnv } from "@/server/cloudflare/context";
import { createOrRefreshSubscriber } from "@/server/subscriptions/repository";
import { sendVerificationEmail } from "@/server/subscriptions/email";
import { assertTrustedOrigin, getRateLimitBucket } from "@/server/security/request";
import { consumeRateLimit, RateLimitError } from "@/server/security/rate-limit";
import { OriginValidationError } from "@/server/security/request";

type SubscribePayload = {
	email?: string;
};

export async function POST(request: Request) {
	try {
		const env = await getCloudflareEnv();
		assertTrustedOrigin(request, [env.EMAIL_VERIFICATION_BASE_URL ?? new URL(request.url).origin]);
		await consumeRateLimit({
			actionKey: "public_subscribe",
			bucketKey: getRateLimitBucket(request),
			maxAttempts: 8,
			windowSeconds: 60 * 15,
		});
		const payload = (await request.json()) as SubscribePayload;
		const origin = env.EMAIL_VERIFICATION_BASE_URL ?? new URL(request.url).origin;
		const delivery = await createOrRefreshSubscriber({
			email: payload.email ?? "",
			baseUrl: origin,
			shouldExposeVerificationUrl: process.env.NODE_ENV !== "production",
			sendVerificationEmail: ({ email, verificationUrl, unsubscribeUrl }) =>
				sendVerificationEmail({ email, verificationUrl, unsubscribeUrl }),
		});

		return NextResponse.json(delivery);
	} catch (error) {
		if (error instanceof RateLimitError) {
			return NextResponse.json(
				{ error: error.message },
				{ status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
			);
		}
		if (error instanceof OriginValidationError) {
			return NextResponse.json({ error: error.message }, { status: 403 });
		}
		const message = error instanceof Error ? error.message : "Unable to start verification.";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
