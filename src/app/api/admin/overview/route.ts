import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { adminErrorResponse } from "@/server/admin/http";
import { getAdminOverview } from "@/server/admin/repository";

export async function GET(request: Request) {
	try {
		await requireAdminApiSession();
		const { searchParams } = new URL(request.url);
		const staleHours = Number.parseInt(searchParams.get("staleHours") ?? "72", 10);
		const overview = await getAdminOverview({
			staleHours: Number.isNaN(staleHours) ? 72 : staleHours,
		});
		return NextResponse.json(overview);
	} catch (error) {
		return adminErrorResponse(error);
	}
}
