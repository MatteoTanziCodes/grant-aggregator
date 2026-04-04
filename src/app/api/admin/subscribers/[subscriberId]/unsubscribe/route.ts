import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { adminErrorResponse } from "@/server/admin/http";
import { unsubscribeSubscriberById } from "@/server/subscriptions/repository";

type RouteContext = {
	params: Promise<{ subscriberId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
	try {
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
