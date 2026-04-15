import {
	getGrantCompassLatestAdminSnapshot,
	runGrantCompassDiscoverySlice,
} from "@/server/ingestion/grantcompass/run-discovery-slice";
import {
	getFundingCakeLatestAdminSnapshot,
	runFundingCakeDirectoryCrawl,
} from "@/server/ingestion/fundingcake/run-directory-crawl";
import {
	getGrantPortalLatestAdminSnapshot,
	runGrantPortalDirectoryCrawl,
} from "@/server/ingestion/grantportal/run-directory-crawl";
import {
	getGrantWatchLatestAdminSnapshot,
	runGrantWatchDirectoryCrawl,
} from "@/server/ingestion/grantwatch/run-directory-crawl";
import { listCrawlEventsForRun } from "@/server/ingestion/crawl-logging";
import { getRunCandidateSummary } from "@/server/ingestion/grantcompass/repository";
import { getFundingDb } from "@/server/cloudflare/context";
import {
	assessIngestionRun,
	formatIngestionAssessmentLabel,
	type IngestionRunAssessmentOutcome,
} from "@/server/ingestion/run-quality";

export type AdminIngestionSourceId =
	| "grantcompass-directory"
	| "fundingcake-directory"
	| "grantportal-directory"
	| "grantwatch-canada-directory";
export const ADMIN_INGESTION_SOURCE_IDS: AdminIngestionSourceId[] = [
	"grantcompass-directory",
	"fundingcake-directory",
	"grantportal-directory",
	"grantwatch-canada-directory",
];

export type AdminIngestionSnapshot = Awaited<
	ReturnType<typeof getGrantCompassLatestAdminSnapshot>
> & {
	description: string;
};

export type AdminFailedIngestionRun = {
	source: AdminIngestionSnapshot["source"];
	run: NonNullable<AdminIngestionSnapshot["latestRun"]>;
	candidateSummary: AdminIngestionSnapshot["candidateSummary"];
	events: AdminIngestionSnapshot["events"];
	assessment: {
		outcome: Exclude<IngestionRunAssessmentOutcome, "included">;
		label: string;
		reason: string;
		completenessRatio: number | null;
	};
};

type FailedIngestionRunRow = {
	source_id: string;
	source_name: string;
	source_kind: AdminIngestionSnapshot["source"]["kind"];
	base_url: string;
	source_canonical: number;
	source_active: number;
	crawl_strategy: string;
	notes: string | null;
	source_created_at: string;
	source_updated_at: string;
	run_id: string;
	run_status: NonNullable<AdminIngestionSnapshot["latestRun"]>["status"];
	fetched_url: string | null;
	artifact_key: string | null;
	content_hash: string | null;
	discovered_count: number;
	normalized_count: number;
	error_message: string | null;
	started_at: string;
	finished_at: string | null;
};

function assertSupportedSourceId(sourceId: string): asserts sourceId is AdminIngestionSourceId {
	if (
		sourceId !== "grantcompass-directory" &&
		sourceId !== "fundingcake-directory" &&
		sourceId !== "grantportal-directory" &&
		sourceId !== "grantwatch-canada-directory"
	) {
		throw new Error(`Unsupported ingestion source: ${sourceId}`);
	}
}

export async function getAdminIngestionSnapshot(
	sourceId: AdminIngestionSourceId
): Promise<AdminIngestionSnapshot> {
	switch (sourceId) {
		case "grantcompass-directory": {
			const snapshot = await getGrantCompassLatestAdminSnapshot();
			return {
				...snapshot,
				description:
					"Manual bounded crawl of the public GrantCompass explore dataset. Rows land as discovery-tier opportunities with explicit aggregator provenance.",
			};
		}
		case "fundingcake-directory":
			return getFundingCakeLatestAdminSnapshot();
		case "grantportal-directory":
			return getGrantPortalLatestAdminSnapshot();
		case "grantwatch-canada-directory":
			return getGrantWatchLatestAdminSnapshot();
	}
}

export async function listAdminIngestionSnapshots(): Promise<AdminIngestionSnapshot[]> {
	return Promise.all(ADMIN_INGESTION_SOURCE_IDS.map((sourceId) => getAdminIngestionSnapshot(sourceId)));
}

export async function runAdminIngestion(
	sourceId: AdminIngestionSourceId
): Promise<
	| Awaited<ReturnType<typeof runGrantCompassDiscoverySlice>>
	| Awaited<ReturnType<typeof runFundingCakeDirectoryCrawl>>
	| Awaited<ReturnType<typeof runGrantPortalDirectoryCrawl>>
	| Awaited<ReturnType<typeof runGrantWatchDirectoryCrawl>>
> {
	switch (sourceId) {
		case "grantcompass-directory":
			return runGrantCompassDiscoverySlice();
		case "fundingcake-directory":
			return runFundingCakeDirectoryCrawl();
		case "grantportal-directory":
			return runGrantPortalDirectoryCrawl();
		case "grantwatch-canada-directory":
			return runGrantWatchDirectoryCrawl();
	}
}

export function parseAdminIngestionSourceId(sourceId: string): AdminIngestionSourceId {
	assertSupportedSourceId(sourceId);
	return sourceId;
}

export async function listFailedAdminIngestionRuns(
	limit = 20
): Promise<AdminFailedIngestionRun[]> {
	const db = await getFundingDb();
	const boundedLimit = Math.min(Math.max(limit, 1), 50);
	const result = await db
		.prepare(
			`
				SELECT
					s.id AS source_id,
					s.name AS source_name,
					s.kind AS source_kind,
					s.base_url,
					s.canonical AS source_canonical,
					s.active AS source_active,
					s.crawl_strategy,
					s.notes,
					s.created_at AS source_created_at,
					s.updated_at AS source_updated_at,
					r.id AS run_id,
					r.status AS run_status,
					r.fetched_url,
					r.artifact_key,
					r.content_hash,
					r.discovered_count,
					r.normalized_count,
					r.error_message,
					r.started_at,
					r.finished_at
				FROM crawl_runs r
				INNER JOIN source_registry s
					ON s.id = r.source_id
				WHERE
					r.status = 'failed'
					OR (r.status = 'succeeded' AND r.discovered_count <= 0)
					OR (
						r.status = 'succeeded'
						AND r.discovered_count > 0
						AND (CAST(r.normalized_count AS REAL) / r.discovered_count) < 0.6
					)
				ORDER BY r.started_at DESC
				LIMIT ?
			`
		)
		.bind(boundedLimit)
		.all<FailedIngestionRunRow>();

	const rows = result.results.map((row) => row as unknown as FailedIngestionRunRow);

	return Promise.all(
		rows.map(async (row) => {
			const assessment = assessIngestionRun({
				status: row.run_status,
				discoveredCount: row.discovered_count,
				normalizedCount: row.normalized_count,
				errorMessage: row.error_message,
			});
			const [candidateSummary, events] = await Promise.all([
				getRunCandidateSummary(row.run_id).catch(() => null),
				listCrawlEventsForRun(row.run_id, 25),
			]);

			return {
				source: {
					id: row.source_id,
					name: row.source_name,
					kind: row.source_kind,
					baseUrl: row.base_url,
					canonical: row.source_canonical === 1,
					active: row.source_active === 1,
					crawlStrategy: row.crawl_strategy,
					notes: row.notes,
					createdAt: row.source_created_at,
					updatedAt: row.source_updated_at,
				},
				run: {
					id: row.run_id,
					sourceId: row.source_id,
					status: row.run_status,
					fetchedUrl: row.fetched_url,
					artifactKey: row.artifact_key,
					contentHash: row.content_hash,
					discoveredCount: row.discovered_count,
					normalizedCount: row.normalized_count,
					errorMessage: row.error_message,
					startedAt: row.started_at,
					finishedAt: row.finished_at,
				},
				candidateSummary,
				events,
				assessment: {
					outcome: assessment.outcome as Exclude<IngestionRunAssessmentOutcome, "included">,
					label: formatIngestionAssessmentLabel(assessment.outcome),
					reason: assessment.reason,
					completenessRatio: assessment.completenessRatio,
				},
			};
		})
	);
}
