import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { adminErrorResponse } from "@/server/admin/http";
import { getAdminSubscriberDetail } from "@/server/admin/repository";
import { deleteSubscriberById } from "@/server/subscriptions/repository";

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
		await requireAdminApiSession();
		const { subscriberId } = await context.params;
		await deleteSubscriberById(subscriberId);
		return NextResponse.json({ ok: true });
	} catch (error) {
		return adminErrorResponse(error);
	}
}
