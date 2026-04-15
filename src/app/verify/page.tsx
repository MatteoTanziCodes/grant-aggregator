import Link from "next/link";
import { previewVerificationToken, type VerificationPreviewResult } from "@/server/subscriptions/repository";

const resultCopy = {
	verified: {
		eyebrow: "Email verified",
		title: "You’re on the list for funding updates.",
		body: "We’ll use this address when Canadian funding opportunities materially change or new high-signal programs are added.",
	},
	"already-verified": {
		eyebrow: "Already verified",
		title: "This email is already active.",
		body: "You do not need to verify it again unless you unsubscribe and rejoin later.",
	},
	expired: {
		eyebrow: "Link expired",
		title: "Your verification link has expired.",
		body: "Submit your email again and we’ll issue a fresh link.",
	},
	invalid: {
		eyebrow: "Invalid link",
		title: "We could not verify that link.",
		body: "It may have been copied incorrectly or already replaced by a newer verification email.",
	},
	missing: {
		eyebrow: "Missing token",
		title: "There’s no verification token in this URL.",
		body: "Go back to the homepage and request a new verification link.",
	},
} as const;

const previewCopy: Record<VerificationPreviewResult, { eyebrow: string; title: string; body: string; confirmLabel?: string }> = {
	ready: {
		eyebrow: "Confirm verification",
		title: "Confirm this email for funding updates.",
		body: "This step verifies the address attached to your signup and enables delivery for future funding changes worth acting on.",
		confirmLabel: "Verify email",
	},
	"already-verified": resultCopy["already-verified"],
	expired: resultCopy.expired,
	invalid: resultCopy.invalid,
	missing: resultCopy.missing,
};

export default async function VerifyPage({
	searchParams,
}: {
	searchParams: Promise<{ status?: keyof typeof resultCopy; token?: string }>;
}) {
	const params = await searchParams;
	const status = params.status && params.status in resultCopy ? params.status : null;
	const token = params.token ?? null;

	if (status) {
		const content = resultCopy[status];
		return (
			<main className="min-h-screen bg-[var(--background)] px-6 py-10 text-[var(--foreground)] sm:px-10">
				<div className="mx-auto flex min-h-[80vh] max-w-4xl items-center justify-center">
					<section className="w-full rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-strong)] p-8 shadow-[0_18px_50px_rgba(75,30,37,0.06)] md:p-12">
						<p className="font-founders text-[11px] uppercase tracking-[0.32em] text-[var(--accent)]">{content.eyebrow}</p>
						<h1 className="font-founders mt-4 max-w-3xl text-[2.6rem] uppercase tracking-[-0.08em] text-balance sm:text-[3.4rem]">
							{content.title}
						</h1>
						<p className="mt-6 max-w-2xl text-base leading-8 text-[var(--muted)]">{content.body}</p>
						<div className="mt-10 flex flex-wrap gap-4">
							<Link
								href="/"
								className="font-founders rounded-[var(--radius-box)] bg-[var(--accent)] px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition hover:bg-[var(--accent-deep)]"
							>
								Back to signup
							</Link>
						</div>
					</section>
				</div>
			</main>
		);
	}

	const preview = await previewVerificationToken(token);
	const content = previewCopy[preview];

	return (
		<main className="min-h-screen bg-[var(--background)] px-6 py-10 text-[var(--foreground)] sm:px-10">
			<div className="mx-auto flex min-h-[80vh] max-w-4xl items-center justify-center">
				<section className="w-full rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-strong)] p-8 shadow-[0_18px_50px_rgba(75,30,37,0.06)] md:p-12">
					<p className="font-founders text-[11px] uppercase tracking-[0.32em] text-[var(--accent)]">{content.eyebrow}</p>
					<h1 className="font-founders mt-4 max-w-3xl text-[2.6rem] uppercase tracking-[-0.08em] text-balance sm:text-[3.4rem]">
						{content.title}
					</h1>
					<p className="mt-6 max-w-2xl text-base leading-8 text-[var(--muted)]">{content.body}</p>
					<div className="mt-10 flex flex-wrap gap-4">
						{preview === "ready" && token ? (
							<form action="/api/verify" method="post">
								<input type="hidden" name="token" value={token} />
								<button
									type="submit"
									className="font-founders rounded-[var(--radius-box)] bg-[var(--accent)] px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition hover:bg-[var(--accent-deep)]"
								>
									{content.confirmLabel}
								</button>
							</form>
						) : (
							<Link
								href="/"
								className="font-founders rounded-[var(--radius-box)] bg-[var(--accent)] px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-white transition hover:bg-[var(--accent-deep)]"
							>
								Back to signup
							</Link>
						)}
						{preview === "ready" ? (
							<Link
								href="/"
								className="font-founders rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-[var(--accent)] transition hover:border-[var(--accent)]"
							>
								Cancel
							</Link>
						) : null}
					</div>
				</section>
			</div>
		</main>
	);
}
