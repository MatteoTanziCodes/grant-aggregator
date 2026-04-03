import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareEnv } from "@/server/cloudflare/context";
import { verifyTotpCode } from "@/server/admin/totp";

const ADMIN_SESSION_COOKIE = "grant_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

type AdminSessionPayload = {
	username: string;
	exp: number;
};

function toBase64Url(value: string): string {
	return Buffer.from(value, "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
	return Buffer.from(normalized + padding, "base64").toString("utf8");
}

function constantTimeEqual(left: string, right: string): boolean {
	const leftBytes = Buffer.from(left);
	const rightBytes = Buffer.from(right);
	const length = Math.max(leftBytes.length, rightBytes.length);
	let mismatch = leftBytes.length === rightBytes.length ? 0 : 1;

	for (let index = 0; index < length; index += 1) {
		mismatch |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	}

	return mismatch === 0;
}

async function signValue(value: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

	return Buffer.from(signature)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

async function getAdminRuntimeConfig() {
	const env = await getCloudflareEnv();
	const username = env.ADMIN_BASIC_AUTH_USERNAME ?? process.env.ADMIN_BASIC_AUTH_USERNAME;
	const password = env.ADMIN_BASIC_AUTH_PASSWORD ?? process.env.ADMIN_BASIC_AUTH_PASSWORD;
	const totpSecret = env.ADMIN_TOTP_SECRET ?? process.env.ADMIN_TOTP_SECRET;
	const sessionSecret = env.ADMIN_SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;

	if (!username || !password || !totpSecret || !sessionSecret) {
		throw new Error(
			"Admin auth is not configured. Set ADMIN_BASIC_AUTH_USERNAME, ADMIN_BASIC_AUTH_PASSWORD, ADMIN_TOTP_SECRET, and ADMIN_SESSION_SECRET."
		);
	}

	return {
		username,
		password,
		totpSecret,
		sessionSecret,
	};
}

export function getAdminSessionCookieName(): string {
	return ADMIN_SESSION_COOKIE;
}

export function getAdminSessionDurationSeconds(): number {
	return SESSION_DURATION_SECONDS;
}

export async function checkAdminCredentials(input: {
	username: string;
	password: string;
	totpCode: string;
}): Promise<{
	usernameMatches: boolean;
	passwordMatches: boolean;
	totpMatches: boolean;
}> {
	const config = await getAdminRuntimeConfig();
	const usernameMatches = constantTimeEqual(input.username, config.username);
	const passwordMatches = constantTimeEqual(input.password, config.password);
	const totpMatches = usernameMatches && passwordMatches ? await verifyTotpCode(config.totpSecret, input.totpCode) : false;

	return {
		usernameMatches,
		passwordMatches,
		totpMatches,
	};
}

export async function validateAdminCredentials(input: {
	username: string;
	password: string;
	totpCode: string;
}): Promise<boolean> {
	const result = await checkAdminCredentials(input);
	return result.usernameMatches && result.passwordMatches && result.totpMatches;
}

export async function createAdminSessionValue(username: string): Promise<string> {
	const { sessionSecret } = await getAdminRuntimeConfig();
	const payload: AdminSessionPayload = {
		username,
		exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
	};
	const encodedPayload = toBase64Url(JSON.stringify(payload));
	const signature = await signValue(encodedPayload, sessionSecret);

	return `${encodedPayload}.${signature}`;
}

export async function readAdminSession(): Promise<AdminSessionPayload | null> {
	const { sessionSecret } = await getAdminRuntimeConfig();
	const cookieStore = await cookies();
	const rawValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

	if (!rawValue) {
		return null;
	}

	const [encodedPayload, providedSignature] = rawValue.split(".");
	if (!encodedPayload || !providedSignature) {
		return null;
	}

	const expectedSignature = await signValue(encodedPayload, sessionSecret);
	if (!constantTimeEqual(providedSignature, expectedSignature)) {
		return null;
	}

	try {
		const payload = JSON.parse(fromBase64Url(encodedPayload)) as AdminSessionPayload;
		if (typeof payload.username !== "string" || typeof payload.exp !== "number") {
			return null;
		}
		if (payload.exp <= Math.floor(Date.now() / 1000)) {
			return null;
		}
		return payload;
	} catch {
		return null;
	}
}

export async function requireAdminPageSession(): Promise<AdminSessionPayload> {
	const session = await readAdminSession();

	if (!session) {
		redirect("/admin/login");
	}

	return session;
}

export async function requireAdminApiSession(): Promise<AdminSessionPayload> {
	const session = await readAdminSession();

	if (!session) {
		throw new Error("UNAUTHORIZED_ADMIN");
	}

	return session;
}
