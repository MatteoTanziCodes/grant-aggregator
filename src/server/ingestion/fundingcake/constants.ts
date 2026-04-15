import { CANADIAN_PROVINCE_AND_TERRITORY_CODES } from "@/server/ingestion/grantcompass/constants";

export const FUNDINGCAKE_SOURCE_ID = "fundingcake-directory";
export const FUNDINGCAKE_SOURCE_URL =
	"https://fundingcake.com/directory-funding/?num=50&sort=field_deadline";
export const FUNDINGCAKE_SOURCE_HOST = "https://fundingcake.com";
export const FUNDINGCAKE_OPPORTUNITY_ORIGIN = "fundingcake";
export const FUNDINGCAKE_DISCOVERY_PROVINCE_CODES = [...CANADIAN_PROVINCE_AND_TERRITORY_CODES];
