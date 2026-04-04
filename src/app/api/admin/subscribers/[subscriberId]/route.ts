import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { adminErrorResponse } from "@/server/admin/http";
import { getAdminSubscriberDetail } from "@/server/admin/repository";
import { deleteSubscriberById } from "@/server/subscriptions/repository";
import { assertTrustedOrigin } from "@/server/security/request";
import { getCloudflareEnv } from "@/server/cloudflare/context";

type RouteContext = {
	params: Promise<{ subscriberId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
	try {
		await requireAdminApiSession();
		const { subscriberId } = await context.params;
		const detail = await getAdminSubscriberDetail(subscriberId);

		if (!detail) {
			return NextResponse.json({ error: "Record not found." }, { status: 404 });
		}

		return NextResponse.json(detail);
	} catch (error) {
		return adminErrorResponse(error);
	}
}

export async function DELETE(_request: Request, context: RouteContext) {
	try {
		const env = await getCloudflareEnv();
		assertTrustedOrigin(_request, [env.EMAIL_VERIFICATION_BASE_URL ?? new URL(_request.url).origin]);
		const session = await requireAdminApiSession();
		const { subscriberId } = await context.params;
		await deleteSubscriberById({
			subscriberId,
			adminUsername: session.username,
		});
		return NextResponse.json({ ok: true });
	} catch (error) {
		return adminErrorResponse(error);
	}
}
