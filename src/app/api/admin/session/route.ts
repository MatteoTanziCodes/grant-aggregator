import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
	checkAdminCredentials,
	createAdminSessionValue,
	getAdminSessionCookieName,
	getAdminSessionDurationSeconds,
	revokeCurrentAdminSession,
} from "@/server/admin/auth";
import { logAdminAudit } from "@/server/admin/audit";
import { adminErrorResponse } from "@/server/admin/http";
import { assertTrustedOrigin, getRateLimitBucket, getRequestMetadata } from "@/server/security/request";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { getCloudflareEnv } from "@/server/cloudflare/context";

type LoginPayload = {
	username?: string;
	password?: string;
	totpCode?: string;
};

export async function POST(request: Request) {
	try {
		const env = await getCloudflareEnv();
		assertTrustedOrigin(request, [env.EMAIL_VERIFICATION_BASE_URL ?? new URL(request.url).origin]);
		const metadata = getRequestMetadata(request);
		const payload = (await request.json()) as LoginPayload;
		const username = payload.username?.trim() ?? "";
		const password = payload.password ?? "";
		const totpCode = payload.totpCode?.trim() ?? "";
		const rateLimitBucket = `${getRateLimitBucket(request)}:${username || "unknown"}`;

		await consumeRateLimit({
			actionKey: "admin_login",
			bucketKey: rateLimitBucket,
			maxAttempts: 10,
			windowSeconds: 60 * 15,
		});

		if (!username || !password || !totpCode) {
			await logAdminAudit({
				adminUsername: username || "unknown",
				actionType: "admin_login_failed",
				metadata: {
					reason: "missing_fields",
					ip: metadata.ip,
					userAgent: metadata.userAgent,
				},
			});
			return NextResponse.json(
				{ error: "Username, password, and 2FA code are required." },
				{ status: 400 }
			);
		}

		const credentialCheck = await checkAdminCredentials({ username, password, totpCode });
		if (!credentialCheck.usernameMatches || !credentialCheck.passwordMatches || !credentialCheck.totpMatches) {
			await logAdminAudit({
				adminUsername: username || "unknown",
				actionType: "admin_login_failed",
				metadata: {
					ip: metadata.ip,
					userAgent: metadata.userAgent,
					usernameMatches: credentialCheck.usernameMatches,
					passwordMatches: credentialCheck.passwordMatches,
					totpMatches: credentialCheck.totpMatches,
				},
			});
			return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
		}

		const cookieStore = await cookies();
		cookieStore.set({
			name: getAdminSessionCookieName(),
			value: await createAdminSessionValue(username),
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/",
			maxAge: getAdminSessionDurationSeconds(),
		});

		await logAdminAudit({
			adminUsername: username,
			actionType: "admin_login_succeeded",
			metadata: {
				ip: metadata.ip,
				userAgent: metadata.userAgent,
			},
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		return adminErrorResponse(error);
	}
}

export async function DELETE(request: Request) {
	try {
		const env = await getCloudflareEnv();
		assertTrustedOrigin(request, [env.EMAIL_VERIFICATION_BASE_URL ?? new URL(request.url).origin]);
		const metadata = getRequestMetadata(request);
		const revoked = await revokeCurrentAdminSession();
		const cookieStore = await cookies();
		cookieStore.set({
			name: getAdminSessionCookieName(),
			value: "",
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "lax",
			path: "/",
			maxAge: 0,
		});

		if (revoked) {
			await logAdminAudit({
				adminUsername: revoked.username,
				actionType: "admin_logout",
				metadata: {
					ip: metadata.ip,
					userAgent: metadata.userAgent,
				},
			});
		}

		return NextResponse.json({ ok: true });
	} catch (error) {
		return adminErrorResponse(error);
	}
}
