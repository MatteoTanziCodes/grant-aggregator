import { NextResponse } from "next/server";
import { assertMonthlyJobRequestAuthorized } from "@/server/internal/job-auth";
import {
	getLatestMonthlyDigestBatch,
	getLatestMonthlyDigestReport,
} from "@/server/monthly-digest/repository";

export async function GET(request: Request) {
	try {
		await assertMonthlyJobRequestAuthorized(request);

		const [batch, report] = await Promise.all([
			getLatestMonthlyDigestBatch(),
			getLatestMonthlyDigestReport(),
		]);

		return NextResponse.json({
			ok: true,
			batch,
			report: report
				? {
						id: report.id,
						reportMonth: report.reportMonth,
						slug: report.slug,
						title: report.title,
						summary: report.summary,
						publishedAt: report.publishedAt,
					}
				: null,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unexpected internal job error.";
		const status = message === "UNAUTHORIZED_INTERNAL_JOB" ? 401 : 500;

		return NextResponse.json(
			{ error: status === 401 ? "Unauthorized." : message },
			{ status },
		);
	}
}
