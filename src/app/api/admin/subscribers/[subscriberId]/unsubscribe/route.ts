import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { adminErrorResponse } from "@/server/admin/http";
import { unsubscribeSubscriberById } from "@/server/subscriptions/repository";
import { assertTrustedOrigin } from "@/server/security/request";
import { getCloudflareEnv } from "@/server/cloudflare/context";

type RouteContext = {
	params: Promise<{ subscriberId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
	try {
		const env = await getCloudflareEnv();
		assertTrustedOrigin(_request, [env.EMAIL_VERIFICATION_BASE_URL ?? new URL(_request.url).origin]);
		const session = await requireAdminApiSession();
		const { subscriberId } = await context.params;
		await unsubscribeSubscriberById({
			subscriberId,
			adminUsername: session.username,
		});
		return NextResponse.json({ ok: true });
	} catch (error) {
		return adminErrorResponse(error);
	}
}
