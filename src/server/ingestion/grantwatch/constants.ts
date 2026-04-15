import { CANADIAN_PROVINCE_AND_TERRITORY_CODES } from "@/server/ingestion/grantcompass/constants";

export const GRANTWATCH_SOURCE_ID = "grantwatch-canada-directory";
export const GRANTWATCH_SOURCE_URL = "https://canada.grantwatch.com/grant-search.php";
export const GRANTWATCH_SOURCE_HOST = "https://canada.grantwatch.com";
export const GRANTWATCH_CANADA_REGION_JSON =
	'{"domain_name":"Canada.GrantWatch.com","region_name":"Canada","region_type":"country","country_code":"ca","state_code":"ca","domain_code":"ca"}';
export const GRANTWATCH_OPPORTUNITY_ORIGIN = "grantwatch";
export const GRANTWATCH_DISCOVERY_PROVINCE_CODES = [...CANADIAN_PROVINCE_AND_TERRITORY_CODES];
