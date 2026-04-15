import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { logAdminAudit } from "@/server/admin/audit";
import { adminErrorResponse } from "@/server/admin/http";
import {
	getAdminIngestionSnapshot,
	runAdminIngestion,
} from "@/server/admin/ingestion-repository";

const SOURCE_ID = "grantcompass-directory" as const;

export async function GET() {
	try {
		await requireAdminApiSession();
		const snapshot = await getAdminIngestionSnapshot(SOURCE_ID);
		return NextResponse.json(snapshot);
	} catch (error) {
		return adminErrorResponse(error);
	}
}

export async function POST() {
	try {
		const session = await requireAdminApiSession();
		const result = await runAdminIngestion(SOURCE_ID);

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

		const snapshot = await getAdminIngestionSnapshot(SOURCE_ID);
		return NextResponse.json({
			runId: result.run.id,
			status: result.run.status,
			snapshot,
		});
	} catch (error) {
		return adminErrorResponse(error);
	}
}
