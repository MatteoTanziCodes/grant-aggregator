import {
	CANADIAN_PROVINCE_AND_TERRITORY_CODES,
	GRANTCOMPASS_PUBLIC_EXPLORER_URL,
	type CanadianProvinceOrTerritoryCode,
} from "@/server/ingestion/grantcompass/constants";

export type GrantCompassExtractedCandidate = {
	externalKey: string;
	rowNumber: number;
	grantCompassId: number;
	slug: string | null;
	sourceUrl: string;
	officialProgramUrl: string | null;
	title: string;
	organizationName: string;
	amountText: string;
	fundingTypeText: string;
	governmentLevelText: string;
	provinceText: string;
	provinceCodes: CanadianProvinceOrTerritoryCode[];
	industryTags: string[];
	businessStages: string[];
	founderTags: string[];
	summary: string | null;
	programStatusText: string | null;
	rawPayload: Record<string, unknown>;
};

type GrantCompassDatasetRow = {
	id?: unknown;
	slug?: unknown;
	title?: unknown;
	organization?: unknown;
	description?: unknown;
	amount?: unknown;
	level?: unknown;
	fundingType?: unknown;
	provinces?: unknown;
	industries?: unknown;
	businessStage?: unknown;
	tags?: unknown;
	url?: unknown;
	programStatus?: unknown;
};

export class GrantCompassParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "GrantCompassParseError";
	}
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function coerceStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function capitalizeKebabOrWord(value: string): string {
	return value
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function buildGrantCompassDetailUrl(grantCompassId: number): string {
	const url = new URL(GRANTCOMPASS_PUBLIC_EXPLORER_URL);
	url.searchParams.set("grant", String(grantCompassId));
	return url.toString();
}

function parseProvinceCodes(values: string[]): CanadianProvinceOrTerritoryCode[] {
	if (values.some((value) => value.trim().toUpperCase() === "ALL")) {
		return [...CANADIAN_PROVINCE_AND_TERRITORY_CODES];
	}

	return values
		.map((value) => value.trim().toUpperCase())
		.filter((value): value is CanadianProvinceOrTerritoryCode =>
			CANADIAN_PROVINCE_AND_TERRITORY_CODES.includes(value as CanadianProvinceOrTerritoryCode)
		);
}

function parseDatasetRows(input: string): GrantCompassDatasetRow[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch {
		throw new GrantCompassParseError("GrantCompass dataset artifact was not valid JSON.");
	}

	if (!Array.isArray(parsed)) {
		throw new GrantCompassParseError("GrantCompass dataset artifact was not a JSON array.");
	}

	return parsed as GrantCompassDatasetRow[];
}

export async function parseGrantCompassDatasetArtifact(input: string): Promise<GrantCompassExtractedCandidate[]> {
	const rows = parseDatasetRows(input);
	const candidates: GrantCompassExtractedCandidate[] = [];

	for (const [index, row] of rows.entries()) {
		const grantCompassId = typeof row.id === "number" ? row.id : Number.NaN;
		if (!Number.isFinite(grantCompassId)) {
			throw new GrantCompassParseError(`GrantCompass dataset row ${index + 1} is missing a numeric id.`);
		}

		if (!isNonEmptyString(row.title)) {
			throw new GrantCompassParseError(`GrantCompass dataset row ${index + 1} is missing a title.`);
		}

		if (!isNonEmptyString(row.organization)) {
			throw new GrantCompassParseError(
				`GrantCompass dataset row ${index + 1} is missing an organization name.`
			);
		}

		const provinceValues = coerceStringArray(row.provinces);
		const provinceCodes = parseProvinceCodes(provinceValues);

		candidates.push({
			externalKey: `grantcompass-${grantCompassId}`,
			rowNumber: index + 1,
			grantCompassId,
			slug: isNonEmptyString(row.slug) ? row.slug.trim() : null,
			sourceUrl: buildGrantCompassDetailUrl(grantCompassId),
			officialProgramUrl: isNonEmptyString(row.url) ? row.url.trim() : null,
			title: row.title.trim(),
			organizationName: row.organization.trim(),
			amountText: isNonEmptyString(row.amount) ? row.amount.trim() : "Unknown",
			fundingTypeText: isNonEmptyString(row.fundingType)
				? capitalizeKebabOrWord(row.fundingType.trim())
				: "Unknown",
			governmentLevelText: isNonEmptyString(row.level)
				? capitalizeKebabOrWord(row.level.trim())
				: "Unknown",
			provinceText: provinceValues.length > 0 ? provinceValues.join(", ") : "Unknown",
			provinceCodes,
			industryTags: coerceStringArray(row.industries),
			businessStages: coerceStringArray(row.businessStage),
			founderTags: coerceStringArray(row.tags),
			summary: isNonEmptyString(row.description) ? row.description.trim() : null,
			programStatusText: isNonEmptyString(row.programStatus) ? row.programStatus.trim() : null,
			rawPayload: row as Record<string, unknown>,
		});
	}

	return candidates;
}
