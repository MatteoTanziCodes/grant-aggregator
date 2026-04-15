import { type CrawlRunLimits } from "@/server/ingestion/crawl-policy";
import { assertSafeFetchTarget } from "@/server/ingestion/source-validation";

export type SafeFetchResult = {
	requestedUrl: string;
	finalUrl: string;
	status: number;
	ok: boolean;
	redirectChain: string[];
	fetchedAt: string;
	durationMs: number;
	bytesFetched: number;
	contentType: string | null;
	contentLengthHeader: number | null;
	cacheControl: string | null;
	etag: string | null;
	lastModified: string | null;
	setCookieHeaders: string[];
	body: Uint8Array;
	responseMetadata: Record<string, unknown>;
};

type FetchWithGuardsOptions = {
	url: string;
	limits: CrawlRunLimits;
	method?: "GET" | "POST";
	headers?: Record<string, string>;
	body?: BodyInit | null;
};

function nowIso(): string {
	return new Date().toISOString();
}

function isRedirectStatus(status: number): boolean {
	return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function parseOptionalInteger(value: string | null): number | null {
	if (!value) {
		return null;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

function readSetCookieHeaders(headers: Headers): string[] {
	const typedHeaders = headers as Headers & {
		getSetCookie?: () => string[];
	};
	if (typeof typedHeaders.getSetCookie === "function") {
		return typedHeaders.getSetCookie();
	}

	const setCookie = headers.get("set-cookie");
	return setCookie ? [setCookie] : [];
}

async function readBodyWithinLimit(
	stream: ReadableStream<Uint8Array> | null,
	maxBytes: number
): Promise<Uint8Array> {
	if (!stream) {
		return new Uint8Array();
	}

	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (!value) {
				continue;
			}

			totalBytes += value.byteLength;
			if (totalBytes > maxBytes) {
				throw new Error("Response body exceeded crawl byte budget.");
			}

			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const body = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return body;
}

export async function fetchWithGuards(options: FetchWithGuardsOptions): Promise<SafeFetchResult> {
	const requestedTarget = assertSafeFetchTarget(options.url);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort("Crawl duration budget exceeded."), options.limits.maxDurationMs);
	const startedAt = Date.now();
	const redirectChain: string[] = [];
	let currentUrl = requestedTarget.toString();
	let response: Response | null = null;

	try {
		for (let redirectCount = 0; redirectCount <= options.limits.maxRedirects; redirectCount += 1) {
			response = await fetch(currentUrl, {
				method: options.method ?? "GET",
				redirect: "manual",
				headers: {
					accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.1",
					...(options.headers ?? {}),
				},
				body: options.body ?? null,
				signal: controller.signal,
			});

			if (!isRedirectStatus(response.status)) {
				break;
			}

			const location = response.headers.get("location");
			if (!location) {
				throw new Error(`Redirect response from ${currentUrl} did not include a location header.`);
			}

			if (redirectCount === options.limits.maxRedirects) {
				throw new Error("Redirect budget exceeded for crawl run.");
			}

			const nextUrl = new URL(location, currentUrl).toString();
			currentUrl = assertSafeFetchTarget(nextUrl).toString();
			redirectChain.push(currentUrl);
		}

		if (!response) {
			throw new Error("No response returned during crawl fetch.");
		}

		const contentLengthHeader = parseOptionalInteger(response.headers.get("content-length"));
		if (contentLengthHeader !== null && contentLengthHeader > options.limits.maxBytesPerRun) {
			throw new Error("Response content-length exceeded crawl byte budget.");
		}

		const body = await readBodyWithinLimit(response.body, options.limits.maxBytesPerRun);
		const durationMs = Date.now() - startedAt;
		const fetchedAt = nowIso();
		const contentType = response.headers.get("content-type");
		const setCookieHeaders = readSetCookieHeaders(response.headers);
		const responseMetadata = {
			requestedUrl: requestedTarget.toString(),
			finalUrl: currentUrl,
			status: response.status,
			ok: response.ok,
			redirectChain,
			contentType,
			contentLengthHeader,
			cacheControl: response.headers.get("cache-control"),
			etag: response.headers.get("etag"),
			lastModified: response.headers.get("last-modified"),
			setCookieHeaders,
			bytesFetched: body.byteLength,
			durationMs,
			fetchedAt,
		} satisfies Record<string, unknown>;

		return {
			requestedUrl: requestedTarget.toString(),
			finalUrl: currentUrl,
			status: response.status,
			ok: response.ok,
			redirectChain,
			fetchedAt,
			durationMs,
			bytesFetched: body.byteLength,
			contentType,
			contentLengthHeader,
			cacheControl: response.headers.get("cache-control"),
			etag: response.headers.get("etag"),
			lastModified: response.headers.get("last-modified"),
			setCookieHeaders,
			body,
			responseMetadata,
		};
	} finally {
		clearTimeout(timeout);
	}
}
