import { NextResponse } from "next/server";
import { unsubscribeFromToken } from "@/server/subscriptions/repository";

export async function GET(request: Request) {
	const { searchParams, origin } = new URL(request.url);
	const status = await unsubscribeFromToken(searchParams.get("token"));
	const target = new URL("/unsubscribe", origin);
	target.searchParams.set("status", status);
	return NextResponse.redirect(target);
}
