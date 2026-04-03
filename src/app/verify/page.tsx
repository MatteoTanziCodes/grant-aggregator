import Link from "next/link";

const copy = {
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

export default async function VerifyPage({
	searchParams,
}: {
	searchParams: Promise<{ status?: keyof typeof copy }>;
}) {
	const params = await searchParams;
	const status = params.status && params.status in copy ? params.status : "missing";
	const content = copy[status];

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
