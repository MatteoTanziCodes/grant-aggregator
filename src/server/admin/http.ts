import { NextResponse } from "next/server";
import { OriginValidationError } from "@/server/security/request";
import { RateLimitError } from "@/server/security/rate-limit";

export function unauthorizedAdminResponse() {
	return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

export function adminErrorResponse(error: unknown) {
	const message = error instanceof Error ? error.message : "Unexpected admin error.";

	if (message === "UNAUTHORIZED_ADMIN") {
		return unauthorizedAdminResponse();
	}

	if (message === "NOT_FOUND") {
		return NextResponse.json({ error: "Record not found." }, { status: 404 });
	}

	if (error instanceof OriginValidationError) {
		return NextResponse.json({ error: error.message }, { status: 403 });
	}

	if (error instanceof RateLimitError) {
		return NextResponse.json(
			{ error: error.message },
			{ status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } }
		);
	}

	return NextResponse.json({ error: message }, { status: 400 });
}
