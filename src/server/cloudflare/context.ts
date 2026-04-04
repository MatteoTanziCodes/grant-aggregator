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

export async function maybeGetCrawlArtifactsBucket(): Promise<R2Bucket | null> {
	const env = await getCloudflareEnv();
	return env.CRAWL_ARTIFACTS ?? null;
}

export async function getCrawlArtifactsBucket(): Promise<R2Bucket> {
	const bucket = await maybeGetCrawlArtifactsBucket();
	if (!bucket) {
		throw new Error("Missing Cloudflare R2 binding: CRAWL_ARTIFACTS");
	}

	return bucket;
}
