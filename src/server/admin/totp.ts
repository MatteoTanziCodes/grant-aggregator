const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

function normalizeSecret(secret: string): string {
	return secret.replace(/\s+/g, "").toUpperCase();
}

function decodeBase32(secret: string): Uint8Array {
	let bits = "";

	for (const char of normalizeSecret(secret)) {
		const index = BASE32_ALPHABET.indexOf(char);
		if (index === -1) {
			throw new Error("Invalid ADMIN_TOTP_SECRET base32 encoding.");
		}
		bits += index.toString(2).padStart(5, "0");
	}

	const bytes: number[] = [];
	for (let index = 0; index + 8 <= bits.length; index += 8) {
		bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
	}

	return new Uint8Array(bytes);
}

async function generateTotp(secret: string, counter: number): Promise<string> {
	const rawSecret = Uint8Array.from(decodeBase32(secret));
	const key = await crypto.subtle.importKey(
		"raw",
		rawSecret,
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"]
	);

	const buffer = new ArrayBuffer(8);
	const view = new DataView(buffer);
	const high = Math.floor(counter / 0x100000000);
	const low = counter % 0x100000000;
	view.setUint32(0, high);
	view.setUint32(4, low);

	const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
	const offset = signature[signature.length - 1] & 0x0f;
	const binary =
		((signature[offset] & 0x7f) << 24) |
		((signature[offset + 1] & 0xff) << 16) |
		((signature[offset + 2] & 0xff) << 8) |
		(signature[offset + 3] & 0xff);

	return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
	const normalizedCode = code.replace(/\s+/g, "");

	if (!/^\d{6}$/.test(normalizedCode)) {
		return false;
	}

	const currentCounter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);

	for (const offset of [-1, 0, 1]) {
		const expected = await generateTotp(secret, currentCounter + offset);
		if (expected === normalizedCode) {
			return true;
		}
	}

	return false;
}
