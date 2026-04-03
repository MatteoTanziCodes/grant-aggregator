import { SignupForm } from "@/components/signup-form";

export default function Home() {
	return (
		<main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f3f0e8_0%,#f8fafc_35%,#e6fffb_100%)] text-stone-950">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute left-[-12rem] top-[-8rem] h-[22rem] w-[22rem] rounded-full bg-teal-300/35 blur-3xl" />
				<div className="absolute right-[-10rem] top-[10rem] h-[24rem] w-[24rem] rounded-full bg-amber-300/35 blur-3xl" />
				<div className="absolute bottom-[-10rem] left-[30%] h-[18rem] w-[18rem] rounded-full bg-cyan-300/20 blur-3xl" />
			</div>

			<div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
				<header className="flex items-center justify-between border-b border-stone-900/8 pb-6">
					<div>
						<p className="font-mono text-xs uppercase tracking-[0.32em] text-stone-500">Grant Aggregator</p>
						<p className="mt-2 text-sm text-stone-600">Canada-first funding intelligence, built for real operators.</p>
					</div>
					<div className="rounded-full border border-stone-900/10 bg-white/70 px-4 py-2 text-xs font-medium text-stone-700 backdrop-blur">
						Stealth intake open
					</div>
				</header>

				<section className="grid flex-1 items-center gap-12 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:py-18">
					<div>
						<p className="font-mono text-xs uppercase tracking-[0.38em] text-teal-800">Email-first launch</p>
						<h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.06em] text-balance sm:text-6xl lg:text-7xl">
							Know when Canadian funding moves before everyone else does.
						</h1>
						<p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700">
							We track only funding opportunities that directly put money into businesses eligible in Canada.
							No mentorship-only noise. No generic ecosystem pages. No account required to join.
						</p>

						<div className="mt-10 max-w-2xl">
							<SignupForm />
						</div>

						<div className="mt-10 grid gap-4 sm:grid-cols-3">
							<div className="rounded-[1.5rem] border border-white/70 bg-white/75 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.08)] backdrop-blur">
								<p className="font-mono text-xs uppercase tracking-[0.28em] text-stone-500">Coverage</p>
								<p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Federal + provincial</p>
								<p className="mt-2 text-sm leading-6 text-stone-600">
									Structured source registry first, with aggregators treated as discovery signals only.
								</p>
							</div>
							<div className="rounded-[1.5rem] border border-white/70 bg-white/75 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.08)] backdrop-blur">
								<p className="font-mono text-xs uppercase tracking-[0.28em] text-stone-500">Messaging</p>
								<p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Meaningful changes only</p>
								<p className="mt-2 text-sm leading-6 text-stone-600">
									Email is for verified funding updates, not drip campaigns tied to signup clicks.
								</p>
							</div>
							<div className="rounded-[1.5rem] border border-white/70 bg-white/75 p-5 shadow-[0_14px_40px_rgba(15,23,42,0.08)] backdrop-blur">
								<p className="font-mono text-xs uppercase tracking-[0.28em] text-stone-500">Filter rule</p>
								<p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Funding-only</p>
								<p className="mt-2 text-sm leading-6 text-stone-600">
									Opportunities must directly provide money to a Canadian-eligible business to make the cut.
								</p>
							</div>
						</div>
					</div>

					<div className="relative">
						<div className="absolute inset-x-10 top-8 h-40 rounded-full bg-teal-300/30 blur-3xl" />
						<section className="relative rounded-[2rem] border border-stone-900/10 bg-stone-950 p-6 text-stone-50 shadow-[0_30px_120px_rgba(15,23,42,0.28)] sm:p-8">
							<div className="flex items-center justify-between">
								<div>
									<p className="font-mono text-xs uppercase tracking-[0.32em] text-teal-300">Alert logic</p>
									<h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">What triggers an email</h2>
								</div>
								<div className="rounded-full border border-white/15 bg-white/8 px-3 py-1 font-mono text-xs text-stone-300">
									Verified only
								</div>
							</div>

							<div className="mt-8 space-y-4">
								<div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
									<p className="font-mono text-xs uppercase tracking-[0.28em] text-teal-300">Included</p>
									<p className="mt-3 text-lg font-medium">Material funding changes</p>
									<p className="mt-2 text-sm leading-6 text-stone-300">
										New programs, deadline changes, amount updates, scope changes, or eligibility shifts that alter whether a business should act.
									</p>
								</div>
								<div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
									<p className="font-mono text-xs uppercase tracking-[0.28em] text-amber-300">Excluded</p>
									<p className="mt-3 text-lg font-medium">Low-signal chatter</p>
									<p className="mt-2 text-sm leading-6 text-stone-300">
										Mentorship pages, ecosystem roundups, investor access listings, and support programs without direct funding do not trigger alerts.
									</p>
								</div>
								<div className="rounded-[1.4rem] border border-white/10 bg-gradient-to-br from-teal-500/18 to-cyan-400/12 p-4">
									<p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-200">Backend now</p>
									<p className="mt-3 text-lg font-medium">Schema built for stealth ingestion</p>
									<p className="mt-2 text-sm leading-6 text-stone-200">
										The database is ready for sources, crawl runs, evidence, normalized opportunities, subscribers, and future notification delivery logs.
									</p>
								</div>
							</div>
						</section>
					</div>
				</section>
			</div>
		</main>
	);
}
