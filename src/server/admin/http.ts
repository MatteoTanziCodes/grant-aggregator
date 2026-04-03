import { NextResponse } from "next/server";

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

	return NextResponse.json({ error: message }, { status: 400 });
}
