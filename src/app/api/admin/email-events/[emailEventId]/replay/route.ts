import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { adminErrorResponse } from "@/server/admin/http";
import { getCloudflareEnv } from "@/server/cloudflare/context";
import { sendVerificationEmail } from "@/server/subscriptions/email";
import { replayEmailEventById } from "@/server/subscriptions/repository";
import { assertTrustedOrigin } from "@/server/security/request";

type RouteContext = {
	params: Promise<{ emailEventId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
	try {
		const env = await getCloudflareEnv();
		assertTrustedOrigin(request, [env.EMAIL_VERIFICATION_BASE_URL ?? new URL(request.url).origin]);
		const session = await requireAdminApiSession();
		const { emailEventId } = await context.params;
		const origin = env.EMAIL_VERIFICATION_BASE_URL ?? new URL(request.url).origin;

		await replayEmailEventById({
			emailEventId,
			baseUrl: origin,
			sendVerificationEmail,
			adminUsername: session.username,
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		return adminErrorResponse(error);
	}
}
