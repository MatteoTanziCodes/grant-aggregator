import {
	ADMIN_INGESTION_SOURCE_IDS,
	getAdminIngestionSnapshot,
	runAdminIngestion,
	type AdminIngestionSourceId,
} from "@/server/admin/ingestion-repository";
import { getCloudflareEnv } from "@/server/cloudflare/context";
import { createEmailEvent } from "@/server/email-events/repository";
import {
	assessIngestionRun,
	type IngestionRunAssessment,
} from "@/server/ingestion/run-quality";
import {
	clearMonthlyDigestBatchSources,
	finalizeMonthlyDigestBatch,
	getMonthlyDigestBatchByMonth,
	getMonthlyDigestRecipientDelivery,
	getMonthlyDigestReportByMonth,
	insertMonthlyNotificationDelivery,
	listMonthlyDigestOpportunitiesForRuns,
	listVerifiedDigestSubscribers,
	prepareMonthlyDigestBatch,
	type MonthlyDigestBatchRecord,
	type MonthlyDigestReportBody,
	type MonthlyDigestReportRecord,
	type MonthlyDigestSourceEntry,
	upsertMonthlyDigestBatchSource,
	upsertMonthlyDigestRecipientDelivery,
	upsertMonthlyDigestReport,
} from "@/server/monthly-digest/repository";
import {
	sendMonthlyDigestEmail,
	toDeliveryErrorDetails,
} from "@/server/subscriptions/email";
import { createUnsubscribeToken } from "@/server/subscriptions/unsubscribe";

type MonthlyDigestRunResult = {
	batch: MonthlyDigestBatchRecord;
	report: MonthlyDigestReportRecord | null;
	skipped: boolean;
};

function nowIso(): string {
	return new Date().toISOString();
}

function getTorontoReportMonth(date = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Toronto",
		year: "numeric",
		month: "2-digit",
	}).formatToParts(date);
	const year = parts.find((part) => part.type === "year")?.value;
	const month = parts.find((part) => part.type === "month")?.value;

	if (!year || !month) {
		throw new Error("Unable to determine Toronto report month.");
	}

	return `${year}-${month}`;
}

function formatReportMonthLabel(reportMonth: string): string {
	const [year, month] = reportMonth.split("-").map((value) => Number.parseInt(value, 10));
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Toronto",
		year: "numeric",
		month: "long",
	}).format(new Date(Date.UTC(year, month - 1, 1)));
}

function buildSourceEntry(input: {
	sourceId: string;
	sourceName: string;
	crawlRunId: string | null;
	assessment: IngestionRunAssessment;
	discoveredCount: number;
	normalizedCount: number;
	errorMessage?: string | null;
}): MonthlyDigestSourceEntry {
	return {
		sourceId: input.sourceId,
		sourceName: input.sourceName,
		crawlRunId: input.crawlRunId,
		outcome: input.assessment.outcome,
		completenessRatio: input.assessment.completenessRatio,
		discoveredCount: input.discoveredCount,
		normalizedCount: input.normalizedCount,
		reason: input.assessment.reason,
		errorMessage: input.errorMessage ?? null,
	};
}

async function getApplicationBaseUrl(): Promise<string> {
	const env = await getCloudflareEnv();
	return (
		env.EMAIL_VERIFICATION_BASE_URL ??
		process.env.EMAIL_VERIFICATION_BASE_URL ??
		"https://grant-aggregator.matteo-tanzi.dev"
	);
}

async function runSourceAndAssess(
	sourceId: AdminIngestionSourceId
): Promise<MonthlyDigestSourceEntry> {
	try {
		const result = await runAdminIngestion(sourceId);
		const assessment = assessIngestionRun({
			status: result.run.status,
			discoveredCount: result.run.discoveredCount,
			normalizedCount: result.run.normalizedCount,
			errorMessage: result.run.errorMessage,
		});

		return buildSourceEntry({
			sourceId: result.source.id,
			sourceName: result.source.name,
			crawlRunId: result.run.id,
			assessment,
			discoveredCount: result.run.discoveredCount,
			normalizedCount: result.run.normalizedCount,
			errorMessage: result.run.errorMessage,
		});
	} catch (error) {
		const snapshot = await getAdminIngestionSnapshot(sourceId);
		const latestRun = snapshot.latestRun;
		const assessment = assessIngestionRun({
			status: latestRun?.status ?? "failed",
			discoveredCount: latestRun?.discoveredCount ?? 0,
			normalizedCount: latestRun?.normalizedCount ?? 0,
			errorMessage:
				latestRun?.errorMessage ??
				(error instanceof Error ? error.message : "Unexpected ingestion failure."),
		});

		return buildSourceEntry({
			sourceId: snapshot.source.id,
			sourceName: snapshot.source.name,
			crawlRunId: latestRun?.id ?? null,
			assessment,
			discoveredCount: latestRun?.discoveredCount ?? 0,
			normalizedCount: latestRun?.normalizedCount ?? 0,
			errorMessage:
				latestRun?.errorMessage ??
				(error instanceof Error ? error.message : "Unexpected ingestion failure."),
		});
	}
}

function buildMonthlyDigestSummary(input: {
	reportMonth: string;
	includedSources: MonthlyDigestSourceEntry[];
	excludedSources: MonthlyDigestSourceEntry[];
	opportunityCount: number;
	generatedAt: string;
	recipientCount?: number;
	emailSentCount?: number;
	emailFailedCount?: number;
}): Record<string, unknown> {
	return {
		reportMonth: input.reportMonth,
		generatedAt: input.generatedAt,
		opportunityCount: input.opportunityCount,
		includedSourceCount: input.includedSources.length,
		excludedSourceCount: input.excludedSources.length,
		includedSources: input.includedSources.map((source) => source.sourceName),
		excludedSources: input.excludedSources.map((source) => ({
			sourceName: source.sourceName,
			outcome: source.outcome,
			reason: source.reason,
		})),
		recipientCount: input.recipientCount ?? 0,
		emailSentCount: input.emailSentCount ?? 0,
		emailFailedCount: input.emailFailedCount ?? 0,
	};
}

export async function runMonthlyDigestCycle(input: {
	triggeredByType: "system" | "admin";
	triggeredByUser?: string | null;
}): Promise<MonthlyDigestRunResult> {
	const reportMonth = getTorontoReportMonth();
	const existingBatch = await getMonthlyDigestBatchByMonth(reportMonth);

	if (existingBatch && existingBatch.status !== "failed") {
		return {
			batch: existingBatch,
			report: await getMonthlyDigestReportByMonth(reportMonth),
			skipped: true,
		};
	}

	const batch = await prepareMonthlyDigestBatch({
		reportMonth,
		triggeredByType: input.triggeredByType,
		triggeredByUser: input.triggeredByUser ?? null,
	});
	await clearMonthlyDigestBatchSources(batch.id);

	const sourceEntries: MonthlyDigestSourceEntry[] = [];
	for (const sourceId of ADMIN_INGESTION_SOURCE_IDS) {
		const entry = await runSourceAndAssess(sourceId);
		sourceEntries.push(entry);
		await upsertMonthlyDigestBatchSource({
			batchId: batch.id,
			sourceId: entry.sourceId,
			crawlRunId: entry.crawlRunId,
			outcome: entry.outcome,
			completenessRatio: entry.completenessRatio,
			discoveredCount: entry.discoveredCount,
			normalizedCount: entry.normalizedCount,
			errorMessage: entry.errorMessage ?? entry.reason,
			details: {
				reason: entry.reason,
				sourceName: entry.sourceName,
			},
		});
	}

	const includedSources = sourceEntries.filter((entry) => entry.outcome === "included");
	const excludedSources = sourceEntries.filter((entry) => entry.outcome !== "included");

	if (includedSources.length === 0) {
		await finalizeMonthlyDigestBatch({
			batchId: batch.id,
			status: "failed",
			includedSourceCount: 0,
			excludedSourceCount: excludedSources.length,
			emailSentCount: 0,
			emailFailedCount: 0,
			summary: buildMonthlyDigestSummary({
				reportMonth,
				includedSources,
				excludedSources,
				opportunityCount: 0,
				generatedAt: nowIso(),
			}),
			errorMessage: "No ingestion sources completed with sufficient data quality for the monthly digest.",
		});

		return {
			batch: {
				...batch,
				status: "failed",
				includedSourceCount: 0,
				excludedSourceCount: excludedSources.length,
				errorMessage:
					"No ingestion sources completed with sufficient data quality for the monthly digest.",
			},
			report: null,
			skipped: false,
		};
	}

	const generatedAt = nowIso();
	const opportunities = await listMonthlyDigestOpportunitiesForRuns(
		includedSources
			.map((entry) => entry.crawlRunId)
			.filter((value): value is string => Boolean(value))
	);
	const reportTitle = `Grant Aggregator Monthly Digest · ${formatReportMonthLabel(reportMonth)}`;
	const reportBody: MonthlyDigestReportBody = {
		reportMonth,
		generatedAt,
		includedSources,
		excludedSources,
		opportunities,
	};
	const reportSummary = buildMonthlyDigestSummary({
		reportMonth,
		includedSources,
		excludedSources,
		opportunityCount: opportunities.length,
		generatedAt,
	});
	const report = await upsertMonthlyDigestReport({
		reportMonth,
		slug: reportMonth,
		title: reportTitle,
		summary: reportSummary,
		body: reportBody,
		publishedAt: generatedAt,
	});

	const baseUrl = await getApplicationBaseUrl();
	const reportUrl = new URL(`/reports/monthly/${report.slug}`, baseUrl).toString();
	const recipients = await listVerifiedDigestSubscribers();
	let emailSentCount = 0;
	let emailFailedCount = 0;

	for (const recipient of recipients) {
		const previousDelivery = await getMonthlyDigestRecipientDelivery(
			report.id,
			recipient.id
		);
		if (
			previousDelivery &&
			(previousDelivery.deliveryStatus === "sent" ||
				previousDelivery.deliveryStatus === "skipped")
		) {
			continue;
		}

		const attemptedAt = nowIso();
		const unsubscribeToken = await createUnsubscribeToken({
			subscriberId: recipient.id,
			email: recipient.email,
		});
		const unsubscribeUrl = new URL("/unsubscribe", baseUrl);
		unsubscribeUrl.searchParams.set("token", unsubscribeToken);

		try {
			const delivery = await sendMonthlyDigestEmail({
				email: recipient.email,
				reportMonthLabel: formatReportMonthLabel(reportMonth),
				reportTitle,
				reportUrl,
				unsubscribeUrl: unsubscribeUrl.toString(),
				opportunityCount: opportunities.length,
				sourceCount: includedSources.length,
				highlights: opportunities.slice(0, 6).map((item) => ({
					title: item.title,
					organizationName: item.organizationName,
					amountText: item.amountText,
					deadlineText: item.deadlineText,
					programUrl: item.programUrl,
				})),
			});
			const emailEventId = await createEmailEvent({
				emailType: "grant_update_digest",
				recipientEmail: recipient.email,
				subscriberId: recipient.id,
				providerName: delivery.providerName,
				providerMessageId: delivery.providerMessageId,
				triggeredByType: input.triggeredByType,
				triggeredByUser: input.triggeredByUser ?? null,
				resultStatus: delivery.resultStatus,
				providerResponseSummary: delivery.providerResponseSummary,
				attemptedAt,
			});

			await insertMonthlyNotificationDelivery({
				subscriberId: recipient.id,
				deliveryStatus: delivery.resultStatus === "sent" ? "sent" : "queued",
				providerMessageId: delivery.providerMessageId ?? null,
				sentAt: delivery.resultStatus === "sent" ? attemptedAt : null,
			});
			await upsertMonthlyDigestRecipientDelivery({
				reportId: report.id,
				subscriberId: recipient.id,
				emailEventId,
				deliveryStatus: delivery.resultStatus,
				providerName: delivery.providerName,
				providerMessageId: delivery.providerMessageId ?? null,
				attemptedAt,
			});

			if (delivery.resultStatus === "sent") {
				emailSentCount += 1;
			}
		} catch (error) {
			const failure = toDeliveryErrorDetails(error);
			const emailEventId = await createEmailEvent({
				emailType: "grant_update_digest",
				recipientEmail: recipient.email,
				subscriberId: recipient.id,
				providerName: failure.providerName,
				triggeredByType: input.triggeredByType,
				triggeredByUser: input.triggeredByUser ?? null,
				resultStatus: "failed",
				providerResponseSummary: failure.providerResponseSummary,
				errorCode: failure.errorCode,
				errorMessage: failure.errorMessage,
				attemptedAt,
			});

			await insertMonthlyNotificationDelivery({
				subscriberId: recipient.id,
				deliveryStatus: "failed",
				errorMessage: failure.errorMessage,
			});
			await upsertMonthlyDigestRecipientDelivery({
				reportId: report.id,
				subscriberId: recipient.id,
				emailEventId,
				deliveryStatus: "failed",
				providerName: failure.providerName,
				errorMessage: failure.errorMessage,
				attemptedAt,
			});
			emailFailedCount += 1;
		}
	}

	const finalSummary = buildMonthlyDigestSummary({
		reportMonth,
		includedSources,
		excludedSources,
		opportunityCount: opportunities.length,
		generatedAt,
		recipientCount: recipients.length,
		emailSentCount,
		emailFailedCount,
	});
	const finalStatus =
		excludedSources.length > 0 || emailFailedCount > 0
			? "completed_with_failures"
			: "completed";

	await finalizeMonthlyDigestBatch({
		batchId: batch.id,
		status: finalStatus,
		reportId: report.id,
		includedSourceCount: includedSources.length,
		excludedSourceCount: excludedSources.length,
		emailSentCount,
		emailFailedCount,
		summary: finalSummary,
	});

	return {
		batch: {
			...batch,
			status: finalStatus,
			reportId: report.id,
			includedSourceCount: includedSources.length,
			excludedSourceCount: excludedSources.length,
			emailSentCount,
			emailFailedCount,
			summary: finalSummary,
			finishedAt: nowIso(),
		},
		report,
		skipped: false,
	};
}
