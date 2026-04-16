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
	searchSliceKeys: string[];
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

export type GrantPortalSearchSlice = {
	key: string;
	label: string;
	formData: Record<string, string>;
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
		new RegExp(
			`<li[^>]*>[\\s\\S]*?<strong>\\s*${escapeRegex(label)}\\s*<\\/strong>\\s*([\\s\\S]*?)<\\/li>`,
			"i"
		)
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

function extractSelectOptions(
	input: string,
	selectId: string
): Array<{ value: string; label: string }> {
	const selectMatch = input.match(
		new RegExp(`<select[^>]*id="${escapeRegex(selectId)}"[^>]*>([\\s\\S]*?)<\\/select>`, "i")
	);
	if (!selectMatch?.[1]) {
		return [];
	}

	return Array.from(
		selectMatch[1].matchAll(/<option[^>]*value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/gi)
	)
		.map((match) => ({
			value: decodeHtmlEntities(match[1] ?? "").trim(),
			label: stripHtml(match[2] ?? ""),
		}))
		.filter((option) => option.value.length > 0 && option.label.length > 0);
}

function slugifyGrantPortalSlice(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function parseGrantPortalCsrfToken(input: string): string {
	const match = input.match(/name="_token"\s+value="([^"]+)"/i);
	const token = match?.[1]?.trim();
	if (!token) {
		throw new GrantPortalParseError("GrantPortal search page did not expose a CSRF token.");
	}

	return token;
}

export function parseGrantPortalSearchSlices(input: string): GrantPortalSearchSlice[] {
	const publicFundTypes = extractSelectOptions(input, "publicfundtype");
	const privateFundTypes = extractSelectOptions(input, "privatefundtype");
	const organizationTypes = extractSelectOptions(input, "orgtype");
	const regions = extractSelectOptions(input, "region");
	const purposes = extractSelectOptions(input, "purpose");
	const amounts = extractSelectOptions(input, "amount");

	const slices: GrantPortalSearchSlice[] = [
		{
			key: "public-base",
			label: "Public base search",
			formData: {
				source: "public",
				country: "ca",
				text: "",
			},
		},
		...publicFundTypes.map((option) => ({
			key: `public-fundtype-${slugifyGrantPortalSlice(option.value)}`,
			label: `Public fund type: ${option.label}`,
			formData: {
				source: "public",
				country: "ca",
				text: "",
				"fundtype[]": option.value,
			},
		})),
		...privateFundTypes.map((option) => ({
			key: `private-fundtype-${slugifyGrantPortalSlice(option.value)}`,
			label: `Private fund type: ${option.label}`,
			formData: {
				source: "private",
				country: "ca",
				text: "",
				"fundtype[]": option.value,
			},
		})),
		...organizationTypes.map((option) => ({
			key: `orgtype-${slugifyGrantPortalSlice(option.value)}`,
			label: `Organization type: ${option.label}`,
			formData: {
				source: "public",
				country: "ca",
				text: "",
				orgtype: option.value,
			},
		})),
		...regions.map((option) => ({
			key: `region-${slugifyGrantPortalSlice(option.value)}`,
			label: `Region: ${option.label}`,
			formData: {
				source: "public",
				country: "ca",
				text: "",
				"region[]": option.value,
			},
		})),
		...purposes.map((option) => ({
			key: `purpose-${slugifyGrantPortalSlice(option.value)}`,
			label: `Purpose: ${option.label}`,
			formData: {
				source: "public",
				country: "ca",
				text: "",
				"purpose[]": option.value,
			},
		})),
		...amounts.map((option) => ({
			key: `amount-${slugifyGrantPortalSlice(option.value)}`,
			label: `Amount: ${option.label}`,
			formData: {
				source: "public",
				country: "ca",
				text: "",
				amount: option.value,
			},
		})),
	];

	const dedupedSlices = new Map<string, GrantPortalSearchSlice>();
	for (const slice of slices) {
		dedupedSlices.set(slice.key, slice);
	}

	if (dedupedSlices.size === 0) {
		throw new GrantPortalParseError("GrantPortal search page did not expose crawlable filter slices.");
	}

	return Array.from(dedupedSlices.values());
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
				searchSliceKeys: [],
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
