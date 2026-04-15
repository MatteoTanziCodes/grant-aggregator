export const GRANTCOMPASS_SOURCE_ID = "grantcompass-directory";
export const GRANTCOMPASS_SOURCE_URL = "https://grantcompass.ca/data/grants.json";
export const GRANTCOMPASS_PUBLIC_EXPLORER_URL = "https://grantcompass.ca/explore.html";
export const GRANTCOMPASS_OPPORTUNITY_ORIGIN = "grantcompass";
export const CANADIAN_PROVINCE_AND_TERRITORY_CODES = [
	"AB",
	"BC",
	"MB",
	"NB",
	"NL",
	"NS",
	"NT",
	"NU",
	"ON",
	"PE",
	"QC",
	"SK",
	"YT",
] as const;

export type CanadianProvinceOrTerritoryCode =
	(typeof CANADIAN_PROVINCE_AND_TERRITORY_CODES)[number];
