import {
	FUNDINGCAKE_DISCOVERY_PROVINCE_CODES,
	FUNDINGCAKE_SOURCE_HOST,
} from "@/server/ingestion/fundingcake/constants";
import type { CanadianProvinceOrTerritoryCode } from "@/server/ingestion/grantcompass/constants";

export type FundingCakeExtractedCandidate = {
	externalKey: string;
	listingId: number;
	sourceUrl: string;
	title: string;
	categoryText: string;
	locationText: string;
	provinceCodes: CanadianProvinceOrTerritoryCode[];
	rawPayload: Record<string, unknown>;
};

export type FundingCakeDetailCandidate = {
	title: string;
	categoryText: string;
	locationText: string;
	provinceCodes: CanadianProvinceOrTerritoryCode[];
	amountText: string | null;
	deadlineText: string | null;
	officialProgramUrl: string | null;
	summary: string | null;
	organizationName: string | null;
	rawPayload: Record<string, unknown>;
};

export class FundingCakeParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "FundingCakeParseError";
	}
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
			String.fromCodePoint(Number.parseInt(code, 16))
		)
		.replace(/&nbsp;/g, " ")
		.replace(/&quot;/g, '"')
		.replace(/&#039;|&apos;/g, "'")
		.replace(/&rsquo;/g, "'")
		.replace(/&lsquo;/g, "'")
		.replace(/&rdquo;|&ldquo;/g, '"')
		.replace(/&ndash;/g, "-")
		.replace(/&mdash;/g, "-")
		.replace(/&hellip;/g, "...")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");
}

function stripHtml(value: string): string {
	return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
		.replace(/\s+/g, " ")
		.trim();
}

function buildAbsoluteUrl(url: string): string {
	return new URL(url, FUNDINGCAKE_SOURCE_HOST).toString();
}

function titleCaseWords(value: string): string {
	return value
		.split(/[\s-]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
		.join(" ");
}

function isEligibleLocation(locationText: string): boolean {
	const normalized = locationText.trim().toLowerCase();
	return normalized.includes("canada") || normalized.includes("global");
}

function inferProvinceCodes(locationText: string): CanadianProvinceOrTerritoryCode[] {
	const normalized = locationText.trim().toLowerCase();
	if (normalized === "canada" || normalized === "global" || normalized.includes(", canada")) {
		return [...FUNDINGCAKE_DISCOVERY_PROVINCE_CODES];
	}

	return [];
}

function extractFieldValue(section: string, dataName: string): string | null {
	const match = section.match(
		new RegExp(`data-name="${dataName}"[\\s\\S]*?<div[^>]*class="drts-display-element[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`, "i")
	);

	return match ? stripHtml(match[1] ?? "") || null : null;
}

function extractHref(section: string, dataName: string): string | null {
	const match = section.match(
		new RegExp(`data-name="${dataName}"[\\s\\S]*?<a[^>]+href="([^"]+)"`, "i")
	);

	return match ? buildAbsoluteUrl(decodeHtmlEntities(match[1] ?? "")) : null;
}

function extractDescription(section: string): string | null {
	const match = section.match(
		/data-name="entity_field_post_content"[\s\S]*?<div class="grve-container">([\s\S]*?)<\/div>\s*<\/div>/i
	);

	if (!match) {
		return null;
	}

	return stripHtml(match[1] ?? "") || null;
}

function extractLdJsonNameAndUrl(input: string): { name: string | null; url: string | null } {
	const match = input.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
	if (!match) {
		return { name: null, url: null };
	}

	try {
		const parsed = JSON.parse(decodeHtmlEntities(match[1] ?? ""));
		return {
			name: typeof parsed?.name === "string" ? parsed.name.trim() : null,
			url: typeof parsed?.url === "string" ? parsed.url.trim() : null,
		};
	} catch {
		return { name: null, url: null };
	}
}

function inferOrganizationName(input: {
	title: string;
	officialProgramUrl: string | null;
	summary: string | null;
}): string | null {
	if (input.summary) {
		const sentence = input.summary.split(/[.!?]/).find((item) => item.trim().length > 0)?.trim() ?? "";
		const prefix = sentence.match(/^([A-Z][A-Za-z0-9'&.-]*(?:\s+[A-Z][A-Za-z0-9'&.-]*){0,4})\s+(?:is|offers|launches|awards|announces|provides)\b/);
		if (prefix?.[1]) {
			return prefix[1].trim();
		}
	}

	if (input.officialProgramUrl) {
		try {
			const hostname = new URL(input.officialProgramUrl).hostname.replace(/^www\./i, "");
			const root = hostname.split(".")[0] ?? "";
			if (root) {
				return titleCaseWords(root.replace(/[^a-z0-9]+/gi, " "));
			}
		} catch {
			// Ignore malformed URLs and fall through.
		}
	}

	const firstSegment = input.title.split(/[:\-|]/)[0]?.trim() ?? "";
	return firstSegment && firstSegment !== input.title ? firstSegment : null;
}

export function extractFundingCakePaginationUrls(input: string): string[] {
	const matches = Array.from(
		input.matchAll(/data-ajax-url="([^"]*\/directory-funding\/\?_page=\d+[^"]*)"/g)
	);
	const urls = new Set<string>();

	for (const match of matches) {
		const rawUrl = decodeHtmlEntities(match[1] ?? "");
		if (!rawUrl) {
			continue;
		}
		urls.add(buildAbsoluteUrl(rawUrl));
	}

	return [...urls];
}

export async function parseFundingCakeDirectoryArtifact(
	input: string
): Promise<FundingCakeExtractedCandidate[]> {
	const blocks = input.split(/<div id="drts-content-post-(\d+)"/g);
	if (blocks.length < 3) {
		throw new FundingCakeParseError("FundingCake directory artifact did not contain listing cards.");
	}

	const candidates: FundingCakeExtractedCandidate[] = [];

	for (let index = 1; index < blocks.length; index += 2) {
		const listingId = Number.parseInt(blocks[index] ?? "", 10);
		const blockHtml = blocks[index + 1] ?? "";
		if (!Number.isFinite(listingId)) {
			continue;
		}

		const titleMatch = blockHtml.match(
			/<div data-name="entity_field_post_title"[\s\S]*?<a href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>/i
		);
		const categoryMatch = blockHtml.match(
			/data-name="entity_field_directory_category"[\s\S]*?<a [^>]*>([\s\S]*?)<\/a>/i
		);
		const locationMatch = blockHtml.match(
			/<span class="drts-location-address[^"]*"[^>]*>([\s\S]*?)<\/span>/i
		);

		if (!titleMatch || !categoryMatch || !locationMatch) {
			continue;
		}

		const sourceUrl = buildAbsoluteUrl(decodeHtmlEntities(titleMatch[1] ?? ""));
		const title = stripHtml(titleMatch[2] ?? "");
		const categoryText = stripHtml(categoryMatch[1] ?? "");
		const locationText = stripHtml(locationMatch[1] ?? "");

		if (!title || !categoryText || !locationText || !isEligibleLocation(locationText)) {
			continue;
		}

		candidates.push({
			externalKey: `fundingcake-${listingId}`,
			listingId,
			sourceUrl,
			title,
			categoryText,
			locationText,
			provinceCodes: inferProvinceCodes(locationText),
			rawPayload: {
				listingId,
				sourceUrl,
				title,
				categoryText,
				locationText,
			},
		});
	}

	return candidates;
}

export async function parseFundingCakeDetailArtifact(
	input: string
): Promise<FundingCakeDetailCandidate> {
	const sectionMatch = input.match(
		/<div id="drts-content-post-\d+"[\s\S]*?class="drts-entity[\s\S]*?drts-display--detailed[\s\S]*?(<div data-name="columns"[\s\S]*?<div data-name="group" class="drts-display-element drts-display-element-group-1[\s\S]*?<\/div>\s*<\/div>)/i
	);

	if (!sectionMatch) {
		throw new FundingCakeParseError("FundingCake detail artifact did not contain the detailed listing section.");
	}

	const detailSection = sectionMatch[0];
	const ldJson = extractLdJsonNameAndUrl(input);
	const title =
		stripHtml(detailSection.match(/<h1[^>]*class="grve-single-simple-title"[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "") ||
		ldJson.name ||
		"";
	if (!title) {
		throw new FundingCakeParseError("FundingCake detail artifact was missing a title.");
	}

	const categoryText = extractFieldValue(detailSection, "entity_field_directory_category") ?? "Unknown";
	const locationText =
		extractFieldValue(detailSection, "entity_field_location_location") ??
		extractFieldValue(detailSection, "entity_field_location_address") ??
		"Unknown";
	const amountText = extractFieldValue(detailSection, "entity_field_field_funding");
	const deadlineText = extractFieldValue(detailSection, "entity_field_field_application_timeline");
	const officialProgramUrl = extractHref(detailSection, "entity_field_field_website") ?? ldJson.url;
	const summary = extractDescription(detailSection);
	const provinceCodes = inferProvinceCodes(locationText);
	const organizationName = inferOrganizationName({
		title,
		officialProgramUrl,
		summary,
	});

	return {
		title,
		categoryText,
		locationText,
		provinceCodes,
		amountText,
		deadlineText,
		officialProgramUrl,
		summary,
		organizationName,
		rawPayload: {
			title,
			categoryText,
			locationText,
			amountText,
			deadlineText,
			officialProgramUrl,
			summary,
			organizationName,
		},
	};
}
