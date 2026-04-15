import { inferCanadianProvinceCodes } from "@/server/ingestion/canadian-location";
import { decodeHtmlEntities, stripHtml } from "@/server/ingestion/html-utils";

export type GrantPortalSearchCandidate = {
	externalKey: string;
	programId: number;
	sourceUrl: string;
	title: string;
	summary: string;
	fundingTypeText: string;
	deadlineText: string | null;
	rawPayload: Record<string, unknown>;
};

export type GrantPortalDetailCandidate = {
	title: string;
	organizationName: string | null;
	amountText: string | null;
	deadlineText: string | null;
	fundingTypeText: string;
	regionText: string;
	applicantTypeText: string | null;
	summary: string | null;
	eligibilitySummary: string | null;
	officialProgramUrl: string | null;
	provinceCodes: string[];
	industryTags: string[];
	rawPayload: Record<string, unknown>;
};

export class GrantPortalParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GrantPortalParseError";
	}
}

function buildAbsoluteUrl(url: string): string {
	return new URL(url, "https://grantportal.ca").toString();
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractListFieldHtml(input: string, label: string): string | null {
	const match = input.match(
		new RegExp(`<strong>${escapeRegex(label)}<\\/strong>\\s*([\\s\\S]*?)<\\/li>`, "i")
	);
	return match?.[1]?.trim() ?? null;
}

function extractAnchorHref(input: string): string | null {
	const match = input.match(/<a[^>]+href="([^"]+)"/i);
	return match ? decodeHtmlEntities(match[1] ?? "").trim() : null;
}

function extractTitle(input: string): string | null {
	const match = input.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
	const title = stripHtml(match?.[1] ?? "");
	return title || null;
}

function extractCsvField(input: string | null): string[] {
	if (!input) {
		return [];
	}

	return input
		.split(",")
		.map((part) => stripHtml(part))
		.filter(Boolean);
}

export function parseGrantPortalCsrfToken(input: string): string {
	const match = input.match(/name="_token"\s+value="([^"]+)"/i);
	const token = match?.[1]?.trim();
	if (!token) {
		throw new GrantPortalParseError("GrantPortal search page did not expose a CSRF token.");
	}

	return token;
}

export function parseGrantPortalSearchResults(input: string): GrantPortalSearchCandidate[] {
	const matches = Array.from(
		input.matchAll(
			/data-program="#(\d+)\s([^"]+)"[\s\S]*?<strong>Description\.\s*<\/strong>([\s\S]*?)<\/li>[\s\S]*?<strong>Type\.\s*<\/strong>\s*([\s\S]*?)<\/li>[\s\S]*?<strong>Deadline\.\s*<\/strong>\s*([\s\S]*?)<\/li>[\s\S]*?href="(\/programs\/ca\/\d+)"/gi
		)
	);

	if (matches.length === 0) {
		throw new GrantPortalParseError("GrantPortal search results did not contain program cards.");
	}

	const parsedCandidates = matches
		.map((match): GrantPortalSearchCandidate | null => {
			const programId = Number.parseInt(match[1] ?? "", 10);
			if (!Number.isFinite(programId)) {
				return null;
			}

			const title = decodeHtmlEntities(match[2] ?? "").trim();
			const summary = stripHtml(match[3] ?? "");
			const fundingTypeText = stripHtml(match[4] ?? "");
			const deadlineText = stripHtml(match[5] ?? "") || null;
			const sourceUrl = buildAbsoluteUrl(match[6] ?? "");

			if (!title || !sourceUrl) {
				return null;
			}

			const rawPayload: Record<string, unknown> = {
				programId,
				sourceUrl,
				title,
				summary,
				fundingTypeText,
				deadlineText,
			};

			return {
				externalKey: `grantportal-${programId}`,
				programId,
				sourceUrl,
				title,
				summary,
				fundingTypeText,
				deadlineText,
				rawPayload,
			};
		})
		.filter((candidate): candidate is GrantPortalSearchCandidate => candidate !== null);

	return parsedCandidates;
}

export function parseGrantPortalDetailArtifact(input: string): GrantPortalDetailCandidate {
	const title = extractTitle(input);
	if (!title) {
		throw new GrantPortalParseError("GrantPortal detail page was missing a program title.");
	}

	const funder = stripHtml(extractListFieldHtml(input, "Funder.") ?? "");
	const summary = stripHtml(extractListFieldHtml(input, "Description.") ?? "") || null;
	const amountText = stripHtml(extractListFieldHtml(input, "Max. Amount.") ?? "") || null;
	const regionText = stripHtml(extractListFieldHtml(input, "Region.") ?? "") || "Canada";
	const applicantTypeText = stripHtml(extractListFieldHtml(input, "Applicant Type.") ?? "") || null;
	const deadlineText = stripHtml(extractListFieldHtml(input, "Deadline.") ?? "") || null;
	const fundingTypeText =
		stripHtml(extractListFieldHtml(input, "Funding Type.") ?? "") ||
		stripHtml(extractListFieldHtml(input, "Type.") ?? "") ||
		"Grant";
	const eligibilitySummary =
		stripHtml(extractListFieldHtml(input, "Eligibility Criteria.") ?? "") || null;
	const officialProgramUrl = extractAnchorHref(extractListFieldHtml(input, "Link.") ?? "");
	const sectors = extractCsvField(extractListFieldHtml(input, "Sectors."));
	const provinceCodes = inferCanadianProvinceCodes(regionText);

	return {
		title,
		organizationName: funder || null,
		amountText,
		deadlineText,
		fundingTypeText,
		regionText,
		applicantTypeText,
		summary,
		eligibilitySummary,
		officialProgramUrl,
		provinceCodes,
		industryTags: sectors,
		rawPayload: {
			title,
			funder,
			amountText,
			deadlineText,
			fundingTypeText,
			regionText,
			applicantTypeText,
			summary,
			eligibilitySummary,
			officialProgramUrl,
			sectors,
			provinceCodes,
		},
	};
}
