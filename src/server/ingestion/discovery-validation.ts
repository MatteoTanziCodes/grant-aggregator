import { type CrawlRunLimits } from "@/server/ingestion/crawl-policy";
import { normalizeWhitespace } from "@/server/ingestion/html-utils";
import { fetchWithGuards, type SafeFetchResult } from "@/server/ingestion/safe-fetch";

const BLOCKED_PAGE_PATTERN =
	/\b(404|page not found|access denied|forbidden|sign in|log in|subscribe|memberplus)\b/i;
const GRANT_LIKE_PATTERN =
	/\b(grant|funding|loan|contribution|tax credit|rebate|financing|program|initiative|call for proposals|application|apply)\b/i;
const TITLE_STOPWORDS = new Set([
	"a",
	"and",
	"apply",
	"application",
	"canada",
	"for",
	"from",
	"fund",
	"funding",
	"grant",
	"grants",
	"in",
	"of",
	"on",
	"program",
	"the",
	"to",
	"with",
]);

export type OfficialGrantValidationResult = {
	requestedUrl: string;
	finalUrl: string;
	status: number;
	ok: boolean;
	contentType: string | null;
	title: string | null;
	snippet: string | null;
	accessible: boolean;
	grantLike: boolean;
	valid: boolean;
	reason: string;
	fetchResult: SafeFetchResult;
};

function isBinaryContentType(contentType: string | null): boolean {
	const normalized = contentType?.toLowerCase() ?? "";
	return (
		normalized.startsWith("image/") ||
		normalized.startsWith("audio/") ||
		normalized.startsWith("video/")
	);
}

function isPdfContentType(contentType: string | null): boolean {
	return (contentType?.toLowerCase() ?? "").includes("application/pdf");
}

function isTextualContentType(contentType: string | null): boolean {
	if (!contentType) {
		return true;
	}

	const normalized = contentType.toLowerCase();
	return (
		normalized.startsWith("text/") ||
		normalized.includes("json") ||
		normalized.includes("xml") ||
		normalized.includes("javascript")
	);
}

function decodeMaybeText(fetchResult: SafeFetchResult): string | null {
	if (!isTextualContentType(fetchResult.contentType)) {
		return null;
	}

	try {
		return new TextDecoder().decode(fetchResult.body);
	} catch {
		return null;
	}
}

function extractHtmlTitle(value: string): string | null {
	const match = value.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	const title = normalizeWhitespace(match?.[1] ?? "");
	return title || null;
}

function buildSnippet(value: string): string | null {
	const snippet = normalizeWhitespace(
		value
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<[^>]+>/g, " ")
	);

	return snippet.length > 0 ? snippet.slice(0, 400) : null;
}

function tokenizeTitleHint(value: string | null): string[] {
	if (!value) {
		return [];
	}

	return normalizeWhitespace(value)
		.toLowerCase()
		.split(/[^a-z0-9]+/g)
		.filter((token) => token.length >= 4 && !TITLE_STOPWORDS.has(token));
}

function countTitleTokenMatches(haystack: string, titleHint: string | null): number {
	const tokens = tokenizeTitleHint(titleHint);
	if (tokens.length === 0) {
		return 0;
	}

	const lowerHaystack = haystack.toLowerCase();
	return tokens.filter((token) => lowerHaystack.includes(token)).length;
}

export async function validateOfficialGrantPage(input: {
	url: string;
	titleHint: string | null;
	limits: CrawlRunLimits;
}): Promise<OfficialGrantValidationResult> {
	const fetchResult = await fetchWithGuards({
		url: input.url,
		limits: input.limits,
	});

	if (!fetchResult.ok) {
		return {
			requestedUrl: fetchResult.requestedUrl,
			finalUrl: fetchResult.finalUrl,
			status: fetchResult.status,
			ok: fetchResult.ok,
			contentType: fetchResult.contentType,
			title: null,
			snippet: null,
			accessible: false,
			grantLike: false,
			valid: false,
			reason: `Official program URL returned HTTP ${fetchResult.status}.`,
			fetchResult,
		};
	}

	if (isBinaryContentType(fetchResult.contentType)) {
		return {
			requestedUrl: fetchResult.requestedUrl,
			finalUrl: fetchResult.finalUrl,
			status: fetchResult.status,
			ok: fetchResult.ok,
			contentType: fetchResult.contentType,
			title: null,
			snippet: null,
			accessible: false,
			grantLike: false,
			valid: false,
			reason: "Official program URL returned a non-text binary asset.",
			fetchResult,
		};
	}

	if (isPdfContentType(fetchResult.contentType)) {
		const accessible = fetchResult.body.byteLength >= 512;
		return {
			requestedUrl: fetchResult.requestedUrl,
			finalUrl: fetchResult.finalUrl,
			status: fetchResult.status,
			ok: fetchResult.ok,
			contentType: fetchResult.contentType,
			title: null,
			snippet: null,
			accessible,
			grantLike: accessible,
			valid: accessible,
			reason: accessible
				? "Official program URL resolved to an accessible PDF."
				: "Official program PDF was unexpectedly small.",
			fetchResult,
		};
	}

	const decoded = decodeMaybeText(fetchResult);
	const title = decoded ? extractHtmlTitle(decoded) : null;
	const snippet = decoded ? buildSnippet(decoded) : null;
	const searchableText = `${title ?? ""} ${snippet ?? ""}`.trim();

	if (!decoded || searchableText.length < 120) {
		return {
			requestedUrl: fetchResult.requestedUrl,
			finalUrl: fetchResult.finalUrl,
			status: fetchResult.status,
			ok: fetchResult.ok,
			contentType: fetchResult.contentType,
			title,
			snippet,
			accessible: false,
			grantLike: false,
			valid: false,
			reason: "Official program URL returned too little readable content.",
			fetchResult,
		};
	}

	if (BLOCKED_PAGE_PATTERN.test(searchableText)) {
		return {
			requestedUrl: fetchResult.requestedUrl,
			finalUrl: fetchResult.finalUrl,
			status: fetchResult.status,
			ok: fetchResult.ok,
			contentType: fetchResult.contentType,
			title,
			snippet,
			accessible: false,
			grantLike: false,
			valid: false,
			reason: "Official program URL resolved to an access or error page.",
			fetchResult,
		};
	}

	const titleTokenMatches = countTitleTokenMatches(searchableText, input.titleHint);
	const grantLike = GRANT_LIKE_PATTERN.test(searchableText) || titleTokenMatches >= 2;

	return {
		requestedUrl: fetchResult.requestedUrl,
		finalUrl: fetchResult.finalUrl,
		status: fetchResult.status,
		ok: fetchResult.ok,
		contentType: fetchResult.contentType,
		title,
		snippet,
		accessible: true,
		grantLike,
		valid: grantLike,
		reason: grantLike
			? "Official program URL resolved to an accessible grant-like page."
			: "Official program URL was accessible but did not look like a grant page.",
		fetchResult,
	};
}
