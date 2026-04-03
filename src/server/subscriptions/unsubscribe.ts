import { getCloudflareEnv } from "@/server/cloudflare/context";

const encoder = new TextEncoder();

type UnsubscribePayload = {
	subscriberId: string;
	email: string;
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

async function importSigningKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{
			name: "HMAC",
			hash: "SHA-256",
		},
		false,
		["sign", "verify"]
	);
}

async function signValue(value: string, secret: string): Promise<string> {
	const key = await importSigningKey(secret);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
	return Buffer.from(signature)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

export async function createUnsubscribeToken(payload: UnsubscribePayload): Promise<string> {
	const env = await getCloudflareEnv();

	if (!env.UNSUBSCRIBE_SECRET) {
		throw new Error("Missing UNSUBSCRIBE_SECRET for unsubscribe links.");
	}

	const encodedPayload = toBase64Url(JSON.stringify(payload));
	const signature = await signValue(encodedPayload, env.UNSUBSCRIBE_SECRET);
	return `${encodedPayload}.${signature}`;
}

export async function verifyUnsubscribeToken(token: string | null): Promise<UnsubscribePayload | null> {
	if (!token) {
		return null;
	}

	const env = await getCloudflareEnv();

	if (!env.UNSUBSCRIBE_SECRET) {
		throw new Error("Missing UNSUBSCRIBE_SECRET for unsubscribe links.");
	}

	const [encodedPayload, providedSignature] = token.split(".");

	if (!encodedPayload || !providedSignature) {
		return null;
	}

	const expectedSignature = await signValue(encodedPayload, env.UNSUBSCRIBE_SECRET);

	if (expectedSignature !== providedSignature) {
		return null;
	}

	try {
		const parsed = JSON.parse(fromBase64Url(encodedPayload)) as UnsubscribePayload;
		if (!parsed.subscriberId || !parsed.email) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}
