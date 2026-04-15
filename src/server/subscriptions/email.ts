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

type MonthlyDigestEmailArgs = {
	email: string;
	reportMonthLabel: string;
	reportTitle: string;
	reportUrl: string;
	unsubscribeUrl: string;
	opportunityCount: number;
	sourceCount: number;
	highlights: Array<{
		title: string;
		organizationName: string;
		amountText: string | null;
		deadlineText: string | null;
		programUrl: string;
	}>;
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

function monthlyDigestText(args: MonthlyDigestEmailArgs): string {
	const highlightLines =
		args.highlights.length === 0
			? ["No opportunity highlights were available for this digest."]
			: args.highlights.map((item, index) =>
					[
						`${index + 1}. ${item.title} — ${item.organizationName}`,
						`   ${item.amountText ?? "Amount varies"} · ${item.deadlineText ?? "Deadline not specified"}`,
						`   ${item.programUrl}`,
					].join("\n")
			  );

	return [
		args.reportTitle,
		"",
		`${args.sourceCount} sources contributed ${args.opportunityCount} opportunities in the ${args.reportMonthLabel} monthly digest.`,
		"",
		...highlightLines,
		"",
		`Open the full report: ${args.reportUrl}`,
		`Unsubscribe: ${args.unsubscribeUrl}`,
	].join("\n");
}

function monthlyDigestHtml(args: MonthlyDigestEmailArgs): string {
	const highlightMarkup =
		args.highlights.length === 0
			? "<p style=\"margin:0;color:#7b5e64;\">No opportunity highlights were available for this digest.</p>"
			: args.highlights
					.map(
						(item) => `
							<li style="margin:0 0 18px 0;">
								<p style="margin:0;font-weight:600;color:#4b1e25;">${item.title}</p>
								<p style="margin:6px 0 0 0;color:#7b5e64;">${item.organizationName}</p>
								<p style="margin:6px 0 0 0;color:#4b1e25;">${item.amountText ?? "Amount varies"} · ${item.deadlineText ?? "Deadline not specified"}</p>
								<p style="margin:8px 0 0 0;">
									<a href="${item.programUrl}" style="color:#8b2332;">Open program</a>
								</p>
							</li>
						`
					)
					.join("");

	return `
		<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #4b1e25;">
			<h1 style="font-size: 22px; margin-bottom: 12px;">${args.reportTitle}</h1>
			<p>${args.sourceCount} sources contributed <strong>${args.opportunityCount}</strong> opportunities in the ${args.reportMonthLabel} digest.</p>
			<p style="margin: 24px 0;">
				<a
					href="${args.reportUrl}"
					style="background:#8b2332;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600;"
				>
					Open monthly report
				</a>
			</p>
			<h2 style="font-size: 16px; margin: 28px 0 12px 0;">Highlights</h2>
			<ol style="padding-left: 20px; margin: 0;">
				${highlightMarkup}
			</ol>
			<p style="font-size: 12px; color: #7b5e64; margin-top: 28px;">
				If you no longer want funding updates, you can
				<a href="${args.unsubscribeUrl}" style="color: #8b2332;"> unsubscribe here</a>.
			</p>
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

export async function sendMonthlyDigestEmail(
	args: MonthlyDigestEmailArgs
): Promise<DeliveryResult> {
	return sendEmail({
		to: args.email,
		subject: args.reportTitle,
		text: monthlyDigestText(args),
		html: monthlyDigestHtml(args),
	});
}
