import {
	getGrantCompassLatestAdminSnapshot,
	runGrantCompassDiscoverySlice,
} from "@/server/ingestion/grantcompass/run-discovery-slice";
import {
	getFundingCakeLatestAdminSnapshot,
	runFundingCakeDirectoryCrawl,
} from "@/server/ingestion/fundingcake/run-directory-crawl";

export type AdminIngestionSourceId = "grantcompass-directory" | "fundingcake-directory";

export type AdminIngestionSnapshot = Awaited<
	ReturnType<typeof getGrantCompassLatestAdminSnapshot>
> & {
	description: string;
};

function assertSupportedSourceId(sourceId: string): asserts sourceId is AdminIngestionSourceId {
	if (sourceId !== "grantcompass-directory" && sourceId !== "fundingcake-directory") {
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
	}
}

export async function listAdminIngestionSnapshots(): Promise<AdminIngestionSnapshot[]> {
	return Promise.all([
		getAdminIngestionSnapshot("grantcompass-directory"),
		getAdminIngestionSnapshot("fundingcake-directory"),
	]);
}

export async function runAdminIngestion(
	sourceId: AdminIngestionSourceId
): Promise<
	| Awaited<ReturnType<typeof runGrantCompassDiscoverySlice>>
	| Awaited<ReturnType<typeof runFundingCakeDirectoryCrawl>>
> {
	switch (sourceId) {
		case "grantcompass-directory":
			return runGrantCompassDiscoverySlice();
		case "fundingcake-directory":
			return runFundingCakeDirectoryCrawl();
	}
}

export function parseAdminIngestionSourceId(sourceId: string): AdminIngestionSourceId {
	assertSupportedSourceId(sourceId);
	return sourceId;
}
