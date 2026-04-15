import { getCloudflareEnv } from "@/server/cloudflare/context";

const encoder = new TextEncoder();

function timingSafeEqualStrings(left: string, right: string): boolean {
	const leftBytes = encoder.encode(left);
	const rightBytes = encoder.encode(right);

	if (leftBytes.length !== rightBytes.length) {
		return false;
	}

	let diff = 0;
	for (let index = 0; index < leftBytes.length; index += 1) {
		diff |= leftBytes[index] ^ rightBytes[index];
	}

	return diff === 0;
}

export async function assertMonthlyJobRequestAuthorized(
	request: Request
): Promise<void> {
	const env = await getCloudflareEnv();
	const expectedSecret =
		env.MONTHLY_JOB_SECRET ?? process.env.MONTHLY_JOB_SECRET;

	if (!expectedSecret) {
		throw new Error("Monthly job secret is not configured.");
	}

	const providedSecret = request.headers.get("x-monthly-job-secret") ?? "";
	if (!timingSafeEqualStrings(providedSecret, expectedSecret)) {
		throw new Error("UNAUTHORIZED_INTERNAL_JOB");
	}
}
