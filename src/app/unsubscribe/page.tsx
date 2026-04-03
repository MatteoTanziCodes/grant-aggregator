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
		<main className="min-h-screen bg-[radial-gradient(circle_at_top,#fed7aa_0,#f8fafc_40%,#f5f5f4_100%)] px-6 py-10 text-stone-900">
			<div className="mx-auto flex min-h-[80vh] max-w-3xl items-center justify-center">
				<section className="w-full rounded-[2rem] border border-white/80 bg-white/80 p-8 shadow-[0_30px_120px_rgba(15,23,42,0.12)] backdrop-blur md:p-12">
					<p className="text-xs font-semibold uppercase tracking-[0.35em] text-orange-700">{content.eyebrow}</p>
					<h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">
						{content.title}
					</h1>
					<p className="mt-6 max-w-xl text-base leading-7 text-stone-700">{content.body}</p>
					<div className="mt-10 flex flex-wrap gap-4">
						<Link
							href="/"
							className="rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
						>
							Back to homepage
						</Link>
					</div>
				</section>
			</div>
		</main>
	);
}
