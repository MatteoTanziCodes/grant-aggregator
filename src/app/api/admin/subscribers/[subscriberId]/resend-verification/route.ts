import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { adminErrorResponse } from "@/server/admin/http";
import { getCloudflareEnv } from "@/server/cloudflare/context";
import { sendVerificationEmail } from "@/server/subscriptions/email";
import { resendVerificationForSubscriber } from "@/server/subscriptions/repository";

type RouteContext = {
	params: Promise<{ subscriberId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	try {
		await requireAdminApiSession();
		const { subscriberId } = await context.params;
		const env = await getCloudflareEnv();
		const origin = env.EMAIL_VERIFICATION_BASE_URL ?? new URL(request.url).origin;

		await resendVerificationForSubscriber({
			subscriberId,
			baseUrl: origin,
			sendVerificationEmail,
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		return adminErrorResponse(error);
	}
}
