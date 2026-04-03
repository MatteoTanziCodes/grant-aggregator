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
		<main className="min-h-screen bg-[radial-gradient(circle_at_top,#d1fae5_0,#f8fafc_45%,#f5f5f4_100%)] px-6 py-10 text-stone-900">
			<div className="mx-auto flex min-h-[80vh] max-w-3xl items-center justify-center">
				<section className="w-full rounded-[2rem] border border-white/80 bg-white/80 p-8 shadow-[0_30px_120px_rgba(15,23,42,0.12)] backdrop-blur md:p-12">
					<p className="text-xs font-semibold uppercase tracking-[0.35em] text-teal-700">{content.eyebrow}</p>
					<h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
						{content.title}
					</h1>
					<p className="mt-6 max-w-xl text-base leading-7 text-stone-700">{content.body}</p>
					<div className="mt-10 flex flex-wrap gap-4">
						<Link
							href="/"
							className="rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
						>
							Back to signup
						</Link>
					</div>
				</section>
			</div>
		</main>
	);
}
