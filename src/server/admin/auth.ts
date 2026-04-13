import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareEnv, getFundingDb } from "@/server/cloudflare/context";
import { verifyTotpCode } from "@/server/admin/totp";

const ADMIN_SESSION_COOKIE = "grant_admin_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

type AdminSessionPayload = {
	sessionId: string;
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

function nowIso(): string {
	return new Date().toISOString();
}

function sessionExpiresAtIso(): string {
	return new Date(Date.now() + SESSION_DURATION_SECONDS * 1000).toISOString();
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

async function createSignedSessionValue(payload: AdminSessionPayload): Promise<string> {
	const { sessionSecret } = await getAdminRuntimeConfig();
	const encodedPayload = toBase64Url(JSON.stringify(payload));
	const signature = await signValue(encodedPayload, sessionSecret);
	return `${encodedPayload}.${signature}`;
}

async function parseSignedSessionValue(rawValue: string): Promise<AdminSessionPayload | null> {
	const { sessionSecret } = await getAdminRuntimeConfig();
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
		if (
			typeof payload.sessionId !== "string" ||
			typeof payload.username !== "string" ||
			typeof payload.exp !== "number"
		) {
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

export async function createAdminSessionValue(username: string): Promise<string> {
	const db = await getFundingDb();
	const sessionId = crypto.randomUUID();
	const createdAt = nowIso();
	const expiresAt = sessionExpiresAtIso();

	await db
		.prepare(
			`
				INSERT INTO admin_sessions (
					id,
					username,
					created_at,
					expires_at,
					last_seen_at,
					revoked_at
				)
				VALUES (?, ?, ?, ?, ?, NULL)
			`
		)
		.bind(sessionId, username, createdAt, expiresAt, createdAt)
		.run();

	return createSignedSessionValue({
		sessionId,
		username,
		exp: Math.floor(Date.parse(expiresAt) / 1000),
	});
}

export async function readAdminSession(): Promise<AdminSessionPayload | null> {
	const cookieStore = await cookies();
	const rawValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

	if (!rawValue) {
		return null;
	}

	const payload = await parseSignedSessionValue(rawValue);
	if (!payload) {
		return null;
	}

	const db = await getFundingDb();
	const sessionRow = await db
		.prepare(
			`
				SELECT id, username, expires_at, revoked_at
				FROM admin_sessions
				WHERE id = ?
			`
		)
		.bind(payload.sessionId)
		.first<{
			id: string;
			username: string;
			expires_at: string;
			revoked_at: string | null;
		}>();

	if (!sessionRow || sessionRow.revoked_at || Date.parse(sessionRow.expires_at) <= Date.now()) {
		return null;
	}

	await db
		.prepare("UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?")
		.bind(nowIso(), payload.sessionId)
		.run();

	return payload;
}

export async function revokeCurrentAdminSession(): Promise<AdminSessionPayload | null> {
	const cookieStore = await cookies();
	const rawValue = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
	if (!rawValue) {
		return null;
	}

	const payload = await parseSignedSessionValue(rawValue);
	if (!payload) {
		return null;
	}

	const db = await getFundingDb();
	await db
		.prepare("UPDATE admin_sessions SET revoked_at = ? WHERE id = ?")
		.bind(nowIso(), payload.sessionId)
		.run();

	return payload;
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
