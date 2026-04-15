import { inferCanadianProvinceCodes } from "@/server/ingestion/canadian-location";
import { decodeHtmlEntities, normalizeWhitespace, stripHtml } from "@/server/ingestion/html-utils";
import { GRANTWATCH_DISCOVERY_PROVINCE_CODES, GRANTWATCH_SOURCE_HOST } from "@/server/ingestion/grantwatch/constants";

type GrantWatchFields = Record<string, unknown>;

export type GrantWatchSearchCandidate = {
	externalKey: string;
	grantId: number;
	sourceUrl: string;
	title: string;
	summary: string;
	deadlineText: string | null;
	rawPayload: Record<string, unknown>;
};

export type GrantWatchDetailCandidate = {
	grantId: number;
	title: string;
	organizationName: string;
	amountText: string;
	deadlineText: string | null;
	deadlineAt: string | null;
	fundingTypeText: string;
	governmentLevelText: string;
	provinceText: string;
	provinceCodes: string[];
	officialProgramUrl: string | null;
	summary: string | null;
	recordStatus: "active" | "closed";
	rawPayload: Record<string, unknown>;
};

export class GrantWatchParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GrantWatchParseError";
	}
}

function buildAbsoluteUrl(url: string): string {
	return new URL(url, GRANTWATCH_SOURCE_HOST).toString();
}

function safeString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function stripTagsAndNormalize(value: unknown): string {
	return typeof value === "string" ? stripHtml(value) : "";
}

function inferFundingTypeText(fields: GrantWatchFields): string {
	const joined = [
		safeString(fields.source_type),
		safeString(fields.official_title),
		safeString(fields.unofficial_title),
		stripTagsAndNormalize(fields.description),
	]
		.join(" ")
		.toLowerCase();

	if (joined.includes("loan guarantee")) {
		return "Loan Guarantee";
	}
	if (joined.includes("loan")) {
		return "Loan";
	}
	if (joined.includes("tax credit") || joined.includes("rebate")) {
		return "Tax Credit";
	}
	if (
		joined.includes("award") ||
		joined.includes("competition") ||
		joined.includes("scholarship") ||
		joined.includes("prize")
	) {
		return "Award";
	}

	return "Grant";
}

function inferOrganizationName(fields: GrantWatchFields, officialProgramUrl: string | null, title: string): string {
	const explicit =
		safeString(fields.organization_name) ||
		safeString(fields.agency) ||
		safeString(fields.foundation_region);
	if (explicit) {
		return explicit;
	}

	if (officialProgramUrl) {
		try {
			const hostname = new URL(officialProgramUrl).hostname.replace(/^www\./i, "");
			const root = hostname.split(".")[0] ?? "";
			if (root) {
				return root
					.split(/[^a-z0-9]+/i)
					.filter(Boolean)
					.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
					.join(" ");
			}
		} catch {
			// Ignore malformed URL and fall back.
		}
	}

	return title;
}

function inferProvinceText(fields: GrantWatchFields): string {
	const candidates = [
		safeString(fields.state_name),
		safeString(fields.country_name),
		safeString(fields.source_location),
		safeString(fields.unofficial_title),
		stripTagsAndNormalize(fields.description),
	];
	const joined = normalizeWhitespace(candidates.filter(Boolean).join(" "));
	return joined || "Canada";
}

function isCanadaRelevant(fields: GrantWatchFields): boolean {
	if (safeString(fields.is_all_canada).toUpperCase() === "Y") {
		return true;
	}

	const searchable = [
		safeString(fields.country_name),
		safeString(fields.state_name),
		safeString(fields.source_location),
		safeString(fields.unofficial_title),
		safeString(fields.official_title),
		stripTagsAndNormalize(fields.description),
		stripTagsAndNormalize(fields.fulldescription),
		stripTagsAndNormalize(fields.eligibility_more),
	].join(" ");

	return /\bcanada\b/i.test(searchable) || inferCanadianProvinceCodes(searchable).length > 0;
}

export function parseGrantWatchSearchPage(input: string): GrantWatchSearchCandidate[] {
	const blocks = input.split(/<div class="card shadow-sm border-0 position-relative /g).slice(1);
	if (blocks.length === 0) {
		throw new GrantWatchParseError("GrantWatch search page did not contain result cards.");
	}

	const candidates: GrantWatchSearchCandidate[] = [];

	for (const block of blocks) {
		const grantId = Number.parseInt(block.match(/id="gbox(\d+)"/)?.[1] ?? "", 10);
		const href = block.match(/<a href="(\/grant\/\d+\/[^"]+)"/)?.[1] ?? "";
		const title =
			decodeHtmlEntities(block.match(/aria-label="([^"]+?) \(opens in a new tab\)"/)?.[1] ?? "") ||
			stripHtml(block.match(/<h4[^>]*>([\s\S]*?)<\/h4>/)?.[1] ?? "");
		const deadlineText = normalizeWhitespace(
			decodeHtmlEntities(block.match(/Deadline:\s*([^<]+)/)?.[1] ?? "")
		);
		const summary = stripHtml(block.match(/<p class="description_text[\s\S]*?>([\s\S]*?)<\/p>/)?.[1] ?? "");

		if (!Number.isFinite(grantId) || !href || !title) {
			continue;
		}

		candidates.push({
			externalKey: `grantwatch-${grantId}`,
			grantId,
			sourceUrl: buildAbsoluteUrl(href),
			title,
			summary,
			deadlineText: deadlineText || null,
			rawPayload: {
				grantId,
				sourceUrl: buildAbsoluteUrl(href),
				title,
				summary,
				deadlineText: deadlineText || null,
			},
		});
	}

	return candidates;
}

export function parseGrantWatchDetailArtifact(input: string): GrantWatchDetailCandidate {
	const grantMatch = input.match(/var grant = (\{[\s\S]*?\});/);
	if (!grantMatch) {
		throw new GrantWatchParseError("GrantWatch detail page did not expose the embedded grant payload.");
	}

	let parsed: { fields?: GrantWatchFields } | null = null;
	try {
		parsed = JSON.parse(grantMatch[1] ?? "");
	} catch (error) {
		throw new GrantWatchParseError(
			error instanceof Error
				? `GrantWatch embedded payload could not be parsed: ${error.message}`
				: "GrantWatch embedded payload could not be parsed."
		);
	}

	const fields = parsed?.fields;
	if (!fields) {
		throw new GrantWatchParseError("GrantWatch detail page was missing embedded fields.");
	}

	if (!isCanadaRelevant(fields)) {
		throw new GrantWatchParseError("GrantWatch entry is not Canada-relevant.");
	}

	const grantId = Number.parseInt(safeString(fields.grant_id), 10);
	if (!Number.isFinite(grantId)) {
		throw new GrantWatchParseError("GrantWatch detail page was missing a grant id.");
	}

	const officialProgramUrl =
		safeString(fields.full_text) || safeString(fields.supporting_doc_url) || null;
	const title =
		safeString(fields.unofficial_title) || safeString(fields.official_title) || `GrantWatch ${grantId}`;
	const summary =
		stripTagsAndNormalize(fields.description) || stripTagsAndNormalize(fields.fulldescription) || null;
	const amountText =
		safeString(fields.grant_size) || safeString(fields.funding) || safeString(fields.num_grants) || "Unknown";
	const deadlineAt = safeString(fields.deadline).startsWith("0000-00-00")
		? null
		: safeString(fields.deadline) || null;
	const deadlineText =
		deadlineAt ||
		(stripTagsAndNormalize(fields.conference_details) || safeString(fields.date_display) || null);
	const provinceText = inferProvinceText(fields);
	const provinceCodes =
		safeString(fields.is_all_canada).toUpperCase() === "Y"
			? [...GRANTWATCH_DISCOVERY_PROVINCE_CODES]
			: inferCanadianProvinceCodes(provinceText);
	const recordStatus =
		(safeString(fields.grant_status) || "").toLowerCase() === "closed" ? "closed" : "active";

	return {
		grantId,
		title,
		organizationName: inferOrganizationName(fields, officialProgramUrl, title),
		amountText,
		deadlineText,
		deadlineAt,
		fundingTypeText: inferFundingTypeText(fields),
		governmentLevelText: safeString(fields.source_type) || "Unknown",
		provinceText,
		provinceCodes,
		officialProgramUrl,
		summary,
		recordStatus,
		rawPayload: {
			...fields,
			officialProgramUrl,
			canadaRelevant: true,
		},
	};
}
