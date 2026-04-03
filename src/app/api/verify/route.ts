import { NextResponse } from "next/server";
import { consumeVerificationToken } from "@/server/subscriptions/repository";

export async function GET(request: Request) {
	const { searchParams, origin } = new URL(request.url);
	const status = await consumeVerificationToken(searchParams.get("token"));
	const target = new URL("/verify", origin);
	target.searchParams.set("status", status);
	return NextResponse.redirect(target);
}
