import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
	checkAdminCredentials,
	createAdminSessionValue,
	getAdminSessionCookieName,
	getAdminSessionDurationSeconds,
} from "@/server/admin/auth";
import { adminErrorResponse } from "@/server/admin/http";

type LoginPayload = {
	username?: string;
	password?: string;
	totpCode?: string;
};

export async function POST(request: Request) {
	try {
		const payload = (await request.json()) as LoginPayload;
		const username = payload.username?.trim() ?? "";
		const password = payload.password ?? "";
		const totpCode = payload.totpCode?.trim() ?? "";

		if (!username || !password || !totpCode) {
			return NextResponse.json(
				{ error: "Username, password, and 2FA code are required." },
				{ status: 400 }
			);
		}

		const credentialCheck = await checkAdminCredentials({ username, password, totpCode });
		if (!credentialCheck.usernameMatches || !credentialCheck.passwordMatches || !credentialCheck.totpMatches) {
			console.warn("Admin login rejected.", credentialCheck);
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

		return NextResponse.json({ ok: true });
	} catch (error) {
		return adminErrorResponse(error);
	}
}

export async function DELETE() {
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

	return NextResponse.json({ ok: true });
}
