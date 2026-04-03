declare namespace Cloudflare {
	interface Env {
		FUNDING_DB: D1Database;
		EMAIL_FROM?: string;
		EMAIL_VERIFICATION_BASE_URL?: string;
		RESEND_API_KEY?: string;
		UNSUBSCRIBE_SECRET?: string;
	}
}
