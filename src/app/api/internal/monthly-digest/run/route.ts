import { NextResponse } from "next/server";
import { assertMonthlyJobRequestAuthorized } from "@/server/internal/job-auth";
import { runMonthlyDigestCycle } from "@/server/monthly-digest/service";

export async function POST(request: Request) {
	try {
		await assertMonthlyJobRequestAuthorized(request);
		const result = await runMonthlyDigestCycle({
			triggeredByType: "system",
		});

		return NextResponse.json({
			skipped: result.skipped,
			batchId: result.batch.id,
			batchStatus: result.batch.status,
			errorMessage: result.batch.errorMessage,
			includedSourceCount: result.batch.includedSourceCount,
			excludedSourceCount: result.batch.excludedSourceCount,
			emailSentCount: result.batch.emailSentCount,
			emailFailedCount: result.batch.emailFailedCount,
			summary: result.batch.summary,
			reportSlug: result.report?.slug ?? null,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unexpected internal job error.";
		const status = message === "UNAUTHORIZED_INTERNAL_JOB" ? 401 : 500;

		return NextResponse.json(
			{ error: status === 401 ? "Unauthorized." : message },
			{ status }
		);
	}
}
