import { NextResponse } from "next/server";
import { getCloudflareEnv } from "@/server/cloudflare/context";
import { createOrRefreshSubscriber } from "@/server/subscriptions/repository";
import { sendVerificationEmail } from "@/server/subscriptions/email";

type SubscribePayload = {
	email?: string;
};

export async function POST(request: Request) {
	try {
		const payload = (await request.json()) as SubscribePayload;
		const env = await getCloudflareEnv();
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
		const message = error instanceof Error ? error.message : "Unable to start verification.";
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
