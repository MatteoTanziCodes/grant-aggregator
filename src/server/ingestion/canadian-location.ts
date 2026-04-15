import {
	CANADIAN_PROVINCE_AND_TERRITORY_CODES,
	type CanadianProvinceOrTerritoryCode,
} from "@/server/ingestion/grantcompass/constants";

const PROVINCE_NAME_TO_CODE: Array<[string, CanadianProvinceOrTerritoryCode]> = [
	["alberta", "AB"],
	["british columbia", "BC"],
	["manitoba", "MB"],
	["new brunswick", "NB"],
	["newfoundland and labrador", "NL"],
	["nova scotia", "NS"],
	["northwest territories", "NT"],
	["nunavut", "NU"],
	["ontario", "ON"],
	["prince edward island", "PE"],
	["quebec", "QC"],
	["saskatchewan", "SK"],
	["yukon", "YT"],
];

export function inferCanadianProvinceCodes(text: string): CanadianProvinceOrTerritoryCode[] {
	const normalized = text.toLowerCase();
	if (normalized.includes("canada") || normalized.includes("national")) {
		return [...CANADIAN_PROVINCE_AND_TERRITORY_CODES];
	}

	const matches = PROVINCE_NAME_TO_CODE.filter(([name]) => normalized.includes(name)).map(
		([, code]) => code
	);
	return [...new Set(matches)];
}
