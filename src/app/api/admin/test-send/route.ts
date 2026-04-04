import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/server/admin/auth";
import { adminErrorResponse } from "@/server/admin/http";
import { sendAdminTestEmailToRecipient } from "@/server/subscriptions/repository";

type TestSendPayload = {
	email?: string;
};

export async function POST(request: Request) {
	try {
		const session = await requireAdminApiSession();
		const payload = (await request.json()) as TestSendPayload;

		const result = await sendAdminTestEmailToRecipient({
			email: payload.email ?? "",
			adminUsername: session.username,
		});

		return NextResponse.json(result);
	} catch (error) {
		return adminErrorResponse(error);
	}
}
