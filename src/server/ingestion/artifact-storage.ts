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
			status: "metadata_only";
			artifact: CrawlArtifactRecord;
			reason: "binding_unavailable";
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

function buildMetadataOnlyArtifactStorageKey(input: {
	sourceId: string;
	crawlRunId: string;
	artifactId: string;
	artifactType: CrawlArtifactType;
	fetchedAt: string;
}): string {
	const safeTimestamp = input.fetchedAt.replaceAll(":", "-").replaceAll(".", "-");
	return [
		"metadata-only",
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

async function insertCrawlArtifactMetadata(input: {
	artifactId: string;
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
	markAsPrimaryForRun?: boolean;
}): Promise<void> {
	const db = await getFundingDb();

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
			input.artifactId,
			input.crawlRunId,
			input.sourceId,
			input.artifactType,
			input.storageKey,
			input.contentHash,
			input.httpStatus,
			input.contentType,
			input.finalUrl,
			JSON.stringify(input.responseMetadata),
			input.fetchedAt,
			input.sizeBytes,
			input.createdAt
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
			.bind(input.storageKey, input.contentHash, input.crawlRunId)
			.run();
	}
}

export async function storeCrawlArtifact(
	input: StoreCrawlArtifactInput
): Promise<CrawlArtifactRecord> {
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
		await insertCrawlArtifactMetadata({
			artifactId,
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
			markAsPrimaryForRun: input.markAsPrimaryForRun,
		});

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

async function recordCrawlArtifactMetadataOnly(
	input: PersistFetchedArtifactInput,
	artifactType: CrawlArtifactType
): Promise<CrawlArtifactRecord> {
	const artifactId = crypto.randomUUID();
	const createdAt = nowIso();
	const finalUrl = normalizeSourceUrl(input.finalUrl);
	const bytes = input.body;
	const sizeBytes = bytes.byteLength;
	const contentHash = await sha256Hex(bytes);
	const contentType = input.contentType?.trim() || defaultContentType(artifactType);
	const storageKey = buildMetadataOnlyArtifactStorageKey({
		sourceId: input.sourceId,
		crawlRunId: input.crawlRunId,
		artifactId,
		artifactType,
		fetchedAt: input.fetchedAt,
	});
	const responseMetadata = {
		...input.responseMetadata,
		storageMode: "metadata_only",
		storageReason: "binding_unavailable",
	};

	await insertCrawlArtifactMetadata({
		artifactId,
		crawlRunId: input.crawlRunId,
		sourceId: input.sourceId,
		artifactType,
		storageKey,
		contentHash,
		httpStatus: input.httpStatus,
		contentType,
		finalUrl,
		responseMetadata,
		fetchedAt: input.fetchedAt,
		sizeBytes,
		createdAt,
		markAsPrimaryForRun: false,
	});

	await logCrawlEvent({
		runId: input.crawlRunId,
		sourceId: input.sourceId,
		level: "warn",
		eventType: "artifact_metadata_recorded_without_storage",
		message: "Recorded artifact metadata without R2 storage because CRAWL_ARTIFACTS is unavailable",
		metadata: {
			artifactId,
			artifactType,
			storageKey,
			contentHash,
			httpStatus: input.httpStatus,
			sizeBytes,
			finalUrl,
		},
	});

	return {
		id: artifactId,
		crawlRunId: input.crawlRunId,
		sourceId: input.sourceId,
		artifactType,
		storageKey,
		contentHash,
		httpStatus: input.httpStatus,
		contentType,
		finalUrl,
		responseMetadata,
		fetchedAt: input.fetchedAt,
		sizeBytes,
		createdAt,
	};
}

export function createDefaultCrawlArtifactPersister(): CrawlArtifactPersister {
	return {
		async persistFetchedArtifact(
			input: PersistFetchedArtifactInput
		): Promise<PersistFetchedArtifactResult> {
			const artifactType = inferArtifactTypeFromContentType(input.contentType);
			if (!artifactType) {
				return {
					status: "skipped",
					reason: "unsupported_content_type",
				};
			}

			const bucket = await maybeGetCrawlArtifactsBucket();
			if (!bucket) {
				const artifact = await recordCrawlArtifactMetadataOnly(input, artifactType);
				return {
					status: "metadata_only",
					artifact,
					reason: "binding_unavailable",
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
