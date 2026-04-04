import Link from "next/link";

const copy = {
	unsubscribed: {
		eyebrow: "Unsubscribed",
		title: "You will not receive grant update emails anymore.",
		body: "Your email has been removed from funding update delivery. You can rejoin later by submitting the same address again.",
	},
	"already-unsubscribed": {
		eyebrow: "Already unsubscribed",
		title: "This email is already opted out.",
		body: "No further action is required unless you want to subscribe again in the future.",
	},
	invalid: {
		eyebrow: "Invalid link",
		title: "We could not validate that unsubscribe link.",
		body: "It may have been altered or copied incorrectly. If needed, request a fresh email and use the unsubscribe link there.",
	},
	missing: {
		eyebrow: "Missing token",
		title: "There is no unsubscribe token in this URL.",
		body: "Use the unsubscribe link from one of our emails so the request can be matched to the right address.",
	},
} as const;

export default async function UnsubscribePage({
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
							Back to homepage
						</Link>
					</div>
				</section>
			</div>
		</main>
	);
}
