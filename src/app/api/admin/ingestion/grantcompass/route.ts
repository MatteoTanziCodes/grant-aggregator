import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { logAdminAudit } from "@/server/admin/audit";
import { adminErrorResponse } from "@/server/admin/http";
import {
	getGrantCompassAdminSnapshot,
	runGrantCompassAdminIngestion,
} from "@/server/admin/ingestion-repository";

export async function GET() {
	try {
		await requireAdminApiSession();
		const snapshot = await getGrantCompassAdminSnapshot();
		return NextResponse.json(snapshot);
	} catch (error) {
		return adminErrorResponse(error);
	}
}

export async function POST() {
	try {
		const session = await requireAdminApiSession();
		const result = await runGrantCompassAdminIngestion();

		await logAdminAudit({
			adminUsername: session.username,
			actionType: "grantcompass_ingestion_run",
			metadata: {
				sourceId: result.source.id,
				runId: result.run.id,
				status: result.run.status,
				artifactStatus: result.artifact.status,
				discoveredCount: result.run.discoveredCount,
				normalizedCount: result.run.normalizedCount,
			},
		});

		const snapshot = await getGrantCompassAdminSnapshot();
		return NextResponse.json({
			runId: result.run.id,
			status: result.run.status,
			snapshot,
		});
	} catch (error) {
		return adminErrorResponse(error);
	}
}
