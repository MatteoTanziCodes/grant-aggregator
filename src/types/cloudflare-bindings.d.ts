declare namespace Cloudflare {
	interface Env {
		FUNDING_DB: D1Database;
		EMAIL_FROM?: string;
		EMAIL_VERIFICATION_BASE_URL?: string;
		RESEND_API_KEY?: string;
		UNSUBSCRIBE_SECRET?: string;
		ADMIN_BASIC_AUTH_USERNAME?: string;
		ADMIN_BASIC_AUTH_PASSWORD?: string;
		ADMIN_TOTP_SECRET?: string;
		ADMIN_SESSION_SECRET?: string;
	}
}
