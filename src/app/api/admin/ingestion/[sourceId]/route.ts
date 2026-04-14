import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { logAdminAudit } from "@/server/admin/audit";
import { adminErrorResponse } from "@/server/admin/http";
import {
	getAdminIngestionSnapshot,
	parseAdminIngestionSourceId,
	runAdminIngestion,
} from "@/server/admin/ingestion-repository";

export async function GET(
	_request: Request,
	context: { params: Promise<{ sourceId: string }> }
) {
	try {
		await requireAdminApiSession();
		const { sourceId: rawSourceId } = await context.params;
		const sourceId = parseAdminIngestionSourceId(rawSourceId);
		const snapshot = await getAdminIngestionSnapshot(sourceId);
		return NextResponse.json(snapshot);
	} catch (error) {
		return adminErrorResponse(error);
	}
}

export async function POST(
	_request: Request,
	context: { params: Promise<{ sourceId: string }> }
) {
	try {
		const session = await requireAdminApiSession();
		const { sourceId: rawSourceId } = await context.params;
		const sourceId = parseAdminIngestionSourceId(rawSourceId);
		const result = await runAdminIngestion(sourceId);

		await logAdminAudit({
			adminUsername: session.username,
			actionType: `${sourceId}_ingestion_run`,
			metadata: {
				sourceId: result.source.id,
				runId: result.run.id,
				status: result.run.status,
				artifactStatus: "artifact" in result ? result.artifact.status : "unknown",
				discoveredCount: result.run.discoveredCount,
				normalizedCount: result.run.normalizedCount,
			},
		});

		const snapshot = await getAdminIngestionSnapshot(sourceId);
		return NextResponse.json({
			runId: result.run.id,
			status: result.run.status,
			snapshot,
		});
	} catch (error) {
		return adminErrorResponse(error);
	}
}
