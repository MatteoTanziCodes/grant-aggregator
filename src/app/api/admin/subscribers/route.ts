import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { adminErrorResponse } from "@/server/admin/http";
import { listAdminSubscribers } from "@/server/admin/repository";

export async function GET(request: Request) {
	try {
		await requireAdminApiSession();

		const { searchParams } = new URL(request.url);
		const q = searchParams.get("q") ?? undefined;
		const status = searchParams.get("status");
		const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
		const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);

		const result = await listAdminSubscribers({
			q,
			status:
				status === "pending_verification" || status === "verified" || status === "unsubscribed" || status === "all"
					? status
					: "all",
			limit: Number.isNaN(limit) ? 50 : limit,
			offset: Number.isNaN(offset) ? 0 : offset,
		});

		return NextResponse.json(result);
	} catch (error) {
		return adminErrorResponse(error);
	}
}
