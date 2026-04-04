import {
	getCrawlArtifactsBucket,
	getFundingDb,
	maybeGetCrawlArtifactsBucket,
} from "@/server/cloudflare/context";
import { logCrawlEvent } from "@/server/ingestion/crawl-logging";
import { normalizeSourceUrl } from "@/server/ingestion/source-validation";

export type CrawlArtifactType = "html" | "markdown" | "json" | "text";

export type CrawlArtifactRecord = {
	id: string;
	crawlRunId: string;
	sourceId: string;
	artifactType: CrawlArtifactType;
	storageKey: string;
	contentHash: string;
	httpStatus: number | null;
	contentType: string | null;
	finalUrl: string;
	responseMetadata: Record<string, unknown>;
	fetchedAt: string;
	sizeBytes: number;
	createdAt: string;
};

type CrawlArtifactRow = {
	id: string;
	crawl_run_id: string;
	source_id: string;
	artifact_type: CrawlArtifactType;
	storage_key: string;
	content_hash: string;
	http_status: number | null;
	content_type: string | null;
	final_url: string;
	response_metadata_json: string;
	fetched_at: string;
	size_bytes: number;
	created_at: string;
};

export type StoreCrawlArtifactInput = {
	crawlRunId: string;
	sourceId: string;
	artifactType: CrawlArtifactType;
	body: ArrayBuffer | ArrayBufferView | string;
	httpStatus?: number | null;
	contentType?: string | null;
	finalUrl: string;
	responseMetadata?: Record<string, unknown>;
	fetchedAt?: string;
	storageKey?: string;
	markAsPrimaryForRun?: boolean;
};

export type PersistFetchedArtifactInput = {
	crawlRunId: string;
	sourceId: string;
	body: Uint8Array;
	httpStatus: number;
	contentType: string | null;
	finalUrl: string;
	responseMetadata: Record<string, unknown>;
	fetchedAt: string;
};

export type PersistFetchedArtifactResult =
	| {
			status: "stored";
			artifact: CrawlArtifactRecord;
	  }
	| {
			status: "skipped";
			reason: "binding_unavailable" | "unsupported_content_type";
	  };

export type CrawlArtifactPersister = {
	persistFetchedArtifact(input: PersistFetchedArtifactInput): Promise<PersistFetchedArtifactResult>;
};

function nowIso(): string {
	return new Date().toISOString();
}

function defaultContentType(artifactType: CrawlArtifactType): string {
	switch (artifactType) {
		case "html":
			return "text/html; charset=utf-8";
		case "markdown":
			return "text/markdown; charset=utf-8";
		case "json":
			return "application/json; charset=utf-8";
		case "text":
			return "text/plain; charset=utf-8";
	}
}

function artifactExtension(artifactType: CrawlArtifactType): string {
	switch (artifactType) {
		case "html":
			return "html";
		case "markdown":
			return "md";
		case "json":
			return "json";
		case "text":
			return "txt";
	}
}

function inferArtifactTypeFromContentType(contentType: string | null): CrawlArtifactType | null {
	if (!contentType) {
		return "text";
	}

	const normalized = contentType.toLowerCase();
	if (normalized.includes("text/html") || normalized.includes("application/xhtml+xml")) {
		return "html";
	}
	if (
		normalized.includes("application/json") ||
		normalized.includes("+json") ||
		normalized.includes("application/feed+json")
	) {
		return "json";
	}
	if (normalized.includes("text/markdown") || normalized.includes("text/x-markdown")) {
		return "markdown";
	}
	if (normalized.startsWith("text/")) {
		return "text";
	}

	return null;
}

function toBytes(body: StoreCrawlArtifactInput["body"]): Uint8Array {
	if (typeof body === "string") {
		return new TextEncoder().encode(body);
	}

	if (body instanceof ArrayBuffer) {
		return new Uint8Array(body);
	}

	return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const digestInput = bytes.slice().buffer as ArrayBuffer;
	const digest = await crypto.subtle.digest("SHA-256", digestInput);
	return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
		""
	);
}

function buildArtifactStorageKey(input: {
	sourceId: string;
	crawlRunId: string;
	artifactId: string;
	artifactType: CrawlArtifactType;
	fetchedAt: string;
}): string {
	const safeTimestamp = input.fetchedAt.replaceAll(":", "-").replaceAll(".", "-");
	return [
		"sources",
		input.sourceId,
		"runs",
		input.crawlRunId,
		`${safeTimestamp}-${input.artifactId}.${artifactExtension(input.artifactType)}`,
	].join("/");
}

function mapArtifactRow(row: CrawlArtifactRow): CrawlArtifactRecord {
	return {
		id: row.id,
		crawlRunId: row.crawl_run_id,
		sourceId: row.source_id,
		artifactType: row.artifact_type,
		storageKey: row.storage_key,
		contentHash: row.content_hash,
		httpStatus: row.http_status,
		contentType: row.content_type,
		finalUrl: row.final_url,
		responseMetadata: JSON.parse(row.response_metadata_json) as Record<string, unknown>,
		fetchedAt: row.fetched_at,
		sizeBytes: row.size_bytes,
		createdAt: row.created_at,
	};
}

export async function storeCrawlArtifact(
	input: StoreCrawlArtifactInput
): Promise<CrawlArtifactRecord> {
	const db = await getFundingDb();
	const bucket = await getCrawlArtifactsBucket();
	const artifactId = crypto.randomUUID();
	const fetchedAt = input.fetchedAt ?? nowIso();
	const createdAt = nowIso();
	const finalUrl = normalizeSourceUrl(input.finalUrl);
	const bytes = toBytes(input.body);
	const sizeBytes = bytes.byteLength;
	const contentHash = await sha256Hex(bytes);
	const contentType = input.contentType?.trim() || defaultContentType(input.artifactType);
	const responseMetadata = input.responseMetadata ?? {};
	const storageKey =
		input.storageKey ??
		buildArtifactStorageKey({
			sourceId: input.sourceId,
			crawlRunId: input.crawlRunId,
			artifactId,
			artifactType: input.artifactType,
			fetchedAt,
		});

	await bucket.put(storageKey, bytes, {
		httpMetadata: {
			contentType,
		},
		customMetadata: {
			artifactId,
			crawlRunId: input.crawlRunId,
			sourceId: input.sourceId,
			artifactType: input.artifactType,
			contentHash,
			finalUrl,
			fetchedAt,
		},
	});

	try {
		await db
			.prepare(
				`
					INSERT INTO crawl_artifacts (
						id,
						crawl_run_id,
						source_id,
						artifact_type,
						storage_key,
						content_hash,
						http_status,
						content_type,
						final_url,
						response_metadata_json,
						fetched_at,
						size_bytes,
						created_at
					)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`
			)
			.bind(
				artifactId,
				input.crawlRunId,
				input.sourceId,
				input.artifactType,
				storageKey,
				contentHash,
				input.httpStatus ?? null,
				contentType,
				finalUrl,
				JSON.stringify(responseMetadata),
				fetchedAt,
				sizeBytes,
				createdAt
			)
			.run();

		if (input.markAsPrimaryForRun) {
			await db
				.prepare(
					`
						UPDATE crawl_runs
						SET
							artifact_key = ?,
							content_hash = ?
						WHERE id = ?
					`
				)
				.bind(storageKey, contentHash, input.crawlRunId)
				.run();
		}

		await logCrawlEvent({
			runId: input.crawlRunId,
			sourceId: input.sourceId,
			level: "info",
			eventType: "artifact_stored",
			message: `Stored ${input.artifactType} artifact in R2`,
			metadata: {
				artifactId,
				storageKey,
				contentHash,
				httpStatus: input.httpStatus ?? null,
				sizeBytes,
				finalUrl,
			},
		});
	} catch (error) {
		await bucket.delete(storageKey);
		throw error;
	}

	return {
		id: artifactId,
		crawlRunId: input.crawlRunId,
		sourceId: input.sourceId,
		artifactType: input.artifactType,
		storageKey,
		contentHash,
		httpStatus: input.httpStatus ?? null,
		contentType,
		finalUrl,
		responseMetadata,
		fetchedAt,
		sizeBytes,
		createdAt,
	};
}

export async function getCrawlArtifactMetadata(
	artifactId: string
): Promise<CrawlArtifactRecord | null> {
	const db = await getFundingDb();
	const row = await db
		.prepare(
			`
				SELECT
					id,
					crawl_run_id,
					source_id,
					artifact_type,
					storage_key,
					content_hash,
					http_status,
					content_type,
					final_url,
					response_metadata_json,
					fetched_at,
					size_bytes,
					created_at
				FROM crawl_artifacts
				WHERE id = ?
			`
		)
		.bind(artifactId)
		.first<CrawlArtifactRow>();

	return row ? mapArtifactRow(row) : null;
}

export async function listCrawlArtifactsForRun(crawlRunId: string): Promise<CrawlArtifactRecord[]> {
	const db = await getFundingDb();
	const result = await db
		.prepare(
			`
				SELECT
					id,
					crawl_run_id,
					source_id,
					artifact_type,
					storage_key,
					content_hash,
					http_status,
					content_type,
					final_url,
					response_metadata_json,
					fetched_at,
					size_bytes,
					created_at
				FROM crawl_artifacts
				WHERE crawl_run_id = ?
				ORDER BY fetched_at DESC
			`
		)
		.bind(crawlRunId)
		.all<CrawlArtifactRow>();

	return result.results.map(mapArtifactRow);
}

export async function getCrawlArtifactBody(storageKey: string): Promise<ArrayBuffer | null> {
	const bucket = await getCrawlArtifactsBucket();
	const object = await bucket.get(storageKey);

	if (!object) {
		return null;
	}

	return object.arrayBuffer();
}

export function createDefaultCrawlArtifactPersister(): CrawlArtifactPersister {
	return {
		async persistFetchedArtifact(
			input: PersistFetchedArtifactInput
		): Promise<PersistFetchedArtifactResult> {
			const bucket = await maybeGetCrawlArtifactsBucket();
			if (!bucket) {
				return {
					status: "skipped",
					reason: "binding_unavailable",
				};
			}

			const artifactType = inferArtifactTypeFromContentType(input.contentType);
			if (!artifactType) {
				return {
					status: "skipped",
					reason: "unsupported_content_type",
				};
			}

			const artifact = await storeCrawlArtifact({
				crawlRunId: input.crawlRunId,
				sourceId: input.sourceId,
				artifactType,
				body: input.body,
				httpStatus: input.httpStatus,
				contentType: input.contentType,
				finalUrl: input.finalUrl,
				responseMetadata: input.responseMetadata,
				fetchedAt: input.fetchedAt,
				markAsPrimaryForRun: true,
			});

			return {
				status: "stored",
				artifact,
			};
		},
	};
}
