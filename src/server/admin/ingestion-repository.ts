import {
	getGrantCompassLatestAdminSnapshot,
	runGrantCompassDiscoverySlice,
} from "@/server/ingestion/grantcompass/run-discovery-slice";

export async function getGrantCompassAdminSnapshot() {
	return getGrantCompassLatestAdminSnapshot();
}

export async function runGrantCompassAdminIngestion() {
	return runGrantCompassDiscoverySlice();
}
