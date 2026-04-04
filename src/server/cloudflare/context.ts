import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getCloudflareEnv(): Promise<CloudflareEnv> {
	const context = await getCloudflareContext({ async: true });
	return context.env;
}

export async function getFundingDb(): Promise<D1Database> {
	const env = await getCloudflareEnv();

	if (!env.FUNDING_DB) {
		throw new Error("Missing Cloudflare D1 binding: FUNDING_DB");
	}

	return env.FUNDING_DB;
}

export async function getCrawlArtifactsBucket(): Promise<R2Bucket> {
	const env = await getCloudflareEnv();

	if (!env.CRAWL_ARTIFACTS) {
		throw new Error("Missing Cloudflare R2 binding: CRAWL_ARTIFACTS");
	}

	return env.CRAWL_ARTIFACTS;
}
