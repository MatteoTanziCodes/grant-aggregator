import { getCloudflareEnv } from "@/server/cloudflare/context";

type VerificationEmailArgs = {
	email: string;
	verificationUrl: string;
	unsubscribeUrl: string;
};

type DeliveryResult = {
	providerMessageId?: string;
};

function verificationText(args: VerificationEmailArgs): string {
	return [
		"Verify your Grant Aggregator email",
		"",
		"Use the link below to confirm your email and start receiving funding updates for Canadian businesses.",
		"",
		args.verificationUrl,
		"",
		"This link expires in 24 hours.",
		"",
		`Unsubscribe: ${args.unsubscribeUrl}`,
	].join("\n");
}

function verificationHtml(args: VerificationEmailArgs): string {
	return `
		<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
			<h1 style="font-size: 20px; margin-bottom: 16px;">Verify your email</h1>
			<p>Confirm your Grant Aggregator email to receive funding updates for Canadian businesses.</p>
			<p style="margin: 24px 0;">
				<a
					href="${args.verificationUrl}"
					style="background:#0f766e;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:600;"
				>
					Verify email
				</a>
			</p>
			<p style="font-size: 14px; color: #4b5563;">This link expires in 24 hours.</p>
			<p style="font-size: 12px; color: #6b7280; margin-top: 24px;">
				If you do not want funding update emails, you can
				<a href="${args.unsubscribeUrl}" style="color: #0f766e;"> unsubscribe here</a>.
			</p>
		</div>
	`;
}

export async function sendVerificationEmail(args: VerificationEmailArgs): Promise<DeliveryResult> {
	const env = await getCloudflareEnv();
	const resendApiKey = env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
	const emailFrom = env.EMAIL_FROM ?? process.env.EMAIL_FROM;

	if (!resendApiKey || !emailFrom) {
		console.log("Verification email delivery not configured. Use this link in development:", args.verificationUrl);
		return { providerMessageId: "development-preview" };
	}

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${resendApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: emailFrom,
			to: [args.email],
			subject: "Verify your Grant Aggregator email",
			text: verificationText(args),
			html: verificationHtml(args),
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Verification email failed: ${response.status} ${body}`);
	}

	const payload = (await response.json()) as { id?: string };

	return {
		providerMessageId: payload.id,
	};
}
