const TOKEN_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
	let encoded = Buffer.from(bytes)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_");

	while (encoded.endsWith("=")) {
		encoded = encoded.slice(0, -1);
	}

	return encoded;
}

export function createVerificationToken(): string {
	return toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export async function hashVerificationToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
