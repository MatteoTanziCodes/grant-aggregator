import { NextResponse } from "next/server";
import { unsubscribeFromToken } from "@/server/subscriptions/repository";
import { assertTrustedOrigin } from "@/server/security/request";
import { getCloudflareEnv } from "@/server/cloudflare/context";

export async function GET(request: Request) {
	const { searchParams, origin } = new URL(request.url);
	const target = new URL("/unsubscribe", origin);
	const token = searchParams.get("token");
	if (token) {
		target.searchParams.set("token", token);
	}
	return NextResponse.redirect(target);
}

export async function POST(request: Request) {
	const env = await getCloudflareEnv();
	assertTrustedOrigin(request, [env.EMAIL_VERIFICATION_BASE_URL ?? new URL(request.url).origin]);

	const origin = new URL(request.url).origin;
	const formData = await request.formData();
	const tokenValue = formData.get("token");
	const token = typeof tokenValue === "string" ? tokenValue : null;
	const status = await unsubscribeFromToken(token);
	const target = new URL("/unsubscribe", origin);
	target.searchParams.set("status", status);
	return NextResponse.redirect(target);
}
