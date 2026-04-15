import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { adminErrorResponse } from "@/server/admin/http";
import { listFailedAdminIngestionRuns } from "@/server/admin/ingestion-repository";

export async function GET() {
	try {
		await requireAdminApiSession();
		const failedRuns = await listFailedAdminIngestionRuns();
		return NextResponse.json(failedRuns);
	} catch (error) {
		return adminErrorResponse(error);
	}
}
