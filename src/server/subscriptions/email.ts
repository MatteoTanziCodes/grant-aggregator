import { getCloudflareEnv } from "@/server/cloudflare/context";

type BaseEmailArgs = {
	to: string;
	subject: string;
	text: string;
	html: string;
};

type VerificationEmailArgs = {
	email: string;
	verificationUrl: string;
	unsubscribeUrl: string;
};

type AdminTestEmailArgs = {
	email: string;
	adminUsername: string;
};

export type DeliveryResult = {
	providerName: string;
	providerMessageId?: string;
	providerResponseSummary?: string;
	resultStatus: "sent" | "skipped";
};

export class EmailDeliveryError extends Error {
	code: string;
	providerName: string;
	providerResponseSummary?: string;

	constructor(args: {
		message: string;
		code: string;
		providerName?: string;
		providerResponseSummary?: string;
	}) {
		super(args.message);
		this.name = "EmailDeliveryError";
		this.code = args.code;
		this.providerName = args.providerName ?? "resend";
		this.providerResponseSummary = args.providerResponseSummary;
	}
}

function summarizePayload(payload: unknown): string {
	try {
		return JSON.stringify(payload);
	} catch {
		return String(payload);
	}
}

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
		<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #4b1e25;">
			<h1 style="font-size: 20px; margin-bottom: 16px;">Verify your email</h1>
			<p>Confirm your Grant Aggregator email to receive funding updates for Canadian businesses.</p>
			<p style="margin: 24px 0;">
				<a
					href="${args.verificationUrl}"
					style="background:#8b2332;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600;"
				>
					Verify email
				</a>
			</p>
			<p style="font-size: 14px; color: #7b5e64;">
				If the button does not open properly, use this link directly:<br />
				<a href="${args.verificationUrl}" style="color: #8b2332; word-break: break-all;">${args.verificationUrl}</a>
			</p>
			<p style="font-size: 14px; color: #7b5e64;">This link expires in 24 hours.</p>
			<p style="font-size: 12px; color: #7b5e64; margin-top: 24px;">
				If you do not want funding update emails, you can
				<a href="${args.unsubscribeUrl}" style="color: #8b2332;"> unsubscribe here</a>.
			</p>
		</div>
	`;
}

function adminTestText(args: AdminTestEmailArgs): string {
	return [
		"Grant Aggregator admin test email",
		"",
		`This is a manual email delivery test triggered by admin user ${args.adminUsername}.`,
		"",
		"If you received this email, the current provider configuration is working.",
	].join("\n");
}

function adminTestHtml(args: AdminTestEmailArgs): string {
	return `
		<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #4b1e25;">
			<h1 style="font-size: 20px; margin-bottom: 16px;">Admin test email</h1>
			<p>This is a manual Grant Aggregator delivery test triggered by admin user <strong>${args.adminUsername}</strong>.</p>
			<p>If you received this email, the current provider configuration is working.</p>
		</div>
	`;
}

async function sendEmail(args: BaseEmailArgs): Promise<DeliveryResult> {
	const env = await getCloudflareEnv();
	const resendApiKey = env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
	const emailFrom = env.EMAIL_FROM ?? process.env.EMAIL_FROM;

	if (!resendApiKey || !emailFrom) {
		console.log("Email delivery not configured. Skipping send to:", args.to);
		return {
			providerName: "development",
			providerMessageId: "development-preview",
			providerResponseSummary: "Email delivery not configured.",
			resultStatus: "skipped",
		};
	}

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${resendApiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: emailFrom,
			to: [args.to],
			subject: args.subject,
			text: args.text,
			html: args.html,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new EmailDeliveryError({
			message: `Email delivery failed: ${response.status} ${body}`,
			code: `resend_${response.status}`,
			providerName: "resend",
			providerResponseSummary: body,
		});
	}

	const payload = (await response.json()) as { id?: string; [key: string]: unknown };

	return {
		providerName: "resend",
		providerMessageId: payload.id,
		providerResponseSummary: summarizePayload(payload),
		resultStatus: "sent",
	};
}

export function toDeliveryErrorDetails(error: unknown): {
	errorCode: string;
	errorMessage: string;
	providerName: string;
	providerResponseSummary?: string;
} {
	if (error instanceof EmailDeliveryError) {
		return {
			errorCode: error.code,
			errorMessage: error.message,
			providerName: error.providerName,
			providerResponseSummary: error.providerResponseSummary,
		};
	}

	return {
		errorCode: "unknown_email_error",
		errorMessage: error instanceof Error ? error.message : "Unexpected email delivery error.",
		providerName: "unknown",
	};
}

export async function sendVerificationEmail(args: VerificationEmailArgs): Promise<DeliveryResult> {
	return sendEmail({
		to: args.email,
		subject: "Verify your Grant Aggregator email",
		text: verificationText(args),
		html: verificationHtml(args),
	});
}

export async function sendAdminTestEmail(args: AdminTestEmailArgs): Promise<DeliveryResult> {
	return sendEmail({
		to: args.email,
		subject: "Grant Aggregator admin test email",
		text: adminTestText(args),
		html: adminTestHtml(args),
	});
}
