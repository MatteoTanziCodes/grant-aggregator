import { SignupForm } from "@/components/signup-form";

export default function Home() {
	return (
		<main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-x-0 top-0 h-px bg-[var(--border)]" />
				<div className="absolute left-[-4rem] top-24 h-[18rem] w-[20rem] rotate-[-8deg] bg-[#efddd3]/90 blur-3xl" />
				<div className="absolute right-[-3rem] top-[10rem] h-[14rem] w-[16rem] rotate-[10deg] bg-[#efe1d6]/90 blur-3xl" />
			</div>

			<div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 sm:px-10 lg:px-12">
				<header className="flex items-center justify-between border-b border-[var(--border)] pb-6">
					<div>
						<p className="font-founders text-[11px] uppercase tracking-[0.32em] text-[var(--accent)]">
							Canadian Funding Intelligence
						</p>
						<p className="mt-2 text-sm text-[var(--muted)]">
							Canada-first funding intelligence, built for real operators.
						</p>
					</div>
				</header>

				<section className="grid flex-1 items-start gap-14 py-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-18 lg:py-18">
					<div>
						<p className="font-founders text-[11px] uppercase tracking-[0.38em] text-[var(--accent)]">
							Tracking capital for Canadian entrepreneurs
						</p>
						<div className="mt-5 max-w-5xl">
							<h1 className="font-founders text-[2.8rem] uppercase leading-[0.98] tracking-[-0.09em] text-balance sm:text-[3.7rem] lg:text-[5.1rem]">
								Know when funding for <span className="text-[var(--accent)]">Canadian entrepreneurs</span> moves before everyone else does.
							</h1>
						</div>
						<p className="mt-8 max-w-2xl text-[1.06rem] leading-8 text-[var(--foreground)]/84">
							We track only funding opportunities that <strong className="font-semibold text-[var(--foreground)]">directly put money into businesses eligible in Canada</strong>.
							<span className="mx-2 inline-block rounded-full bg-[var(--accent)]/10 px-3 py-1 font-semibold text-[var(--accent)]">
								No mentorship-only noise.
							</span>
							<span className="mx-2 inline-block rounded-full bg-[var(--accent)]/10 px-3 py-1 font-semibold text-[var(--accent)]">
								No generic ecosystem pages.
							</span>
							<span className="mx-2 inline-block rounded-full bg-[var(--foreground)]/6 px-3 py-1 font-semibold text-[var(--foreground)]">
								No account required to join.
							</span>
						</p>

						<div className="mt-10">
							<SignupForm />
						</div>
					</div>

					<div className="relative space-y-4">
						<div className="absolute inset-x-10 top-8 h-28 rotate-[3deg] bg-[#ecd6d1] blur-3xl" />
						<section className="relative rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-strong)] p-6 shadow-[0_16px_50px_rgba(75,30,37,0.06)] sm:p-8">
							<div className="flex items-center justify-between gap-4">
								<div>
									<p className="font-founders text-[11px] uppercase tracking-[0.32em] text-[var(--accent)]">Monthly update structure</p>
									<h2 className="font-founders mt-3 text-[1.7rem] uppercase tracking-[-0.06em] text-[var(--foreground)]">
										What lands in the inbox
									</h2>
								</div>
								<div className="font-founders rounded-[var(--radius-chip)] border border-[var(--border)] bg-[var(--surface-card)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--accent)]">
									Verified only
								</div>
							</div>

							<div className="mt-8 space-y-4">
								<div className="rounded-[var(--radius-box)] border border-[var(--accent)]/20 bg-[linear-gradient(180deg,rgba(139,35,50,0.08),rgba(255,255,255,0.92))] p-4 shadow-[0_10px_24px_rgba(139,35,50,0.08)]">
									<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">What&apos;s new</p>
									<p className="font-founders mt-3 text-[1.1rem] uppercase tracking-[-0.05em] text-[var(--foreground)]">
										<span className="text-[var(--accent)]">Movement</span> worth acting on
									</p>
									<p className="mt-2 text-sm leading-6 text-[var(--foreground)]/82">
										<strong className="font-semibold text-[var(--accent)]">New programs</strong>, <strong className="font-semibold">deadline changes</strong>, amount changes, eligibility shifts, and any update that meaningfully changes whether a founder should apply now.
									</p>
								</div>
								<div className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(120,93,63,0.06),rgba(255,255,255,0.94))] p-4 shadow-[0_10px_24px_rgba(120,93,63,0.06)]">
									<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">Recurring availability</p>
									<p className="font-founders mt-3 text-[1.1rem] uppercase tracking-[-0.05em] text-[var(--foreground)]">
										The <span className="text-[var(--accent)]">ongoing</span> base layer
									</p>
									<p className="mt-2 text-sm leading-6 text-[var(--foreground)]/80">
										<strong className="font-semibold">Recurring, evergreen, and rolling opportunities</strong> stay visible with references, so monthly updates cover both fresh movement and the opportunities that remain open.
									</p>
								</div>
								<div className="rounded-[var(--radius-box)] border border-[var(--foreground)]/10 bg-[linear-gradient(180deg,rgba(75,30,37,0.05),rgba(255,255,255,0.95))] p-4 shadow-[0_10px_24px_rgba(75,30,37,0.05)]">
									<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">References</p>
									<p className="font-founders mt-3 text-[1.1rem] uppercase tracking-[-0.05em] text-[var(--foreground)]">
										Every item points back to <span className="text-[var(--accent)]">source</span>
									</p>
									<p className="mt-2 text-sm leading-6 text-[var(--foreground)]/80">
										<strong className="font-semibold">Official program pages stay canonical.</strong> Discovery sources help surface opportunities, but each update is anchored to references you can verify directly.
									</p>
								</div>
							</div>
						</section>

						<div className="grid gap-4 md:grid-cols-2">
							<div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_10px_28px_rgba(75,30,37,0.04)]">
								<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">Coverage</p>
								<p className="font-founders mt-3 text-[1.55rem] uppercase tracking-[-0.06em]">Cash in, not noise out</p>
								<p className="mt-2 text-sm leading-6 text-[var(--muted)]">
									Grants, loans, and other cash-equivalent funding open to Canadian entrepreneurs.
								</p>
							</div>
							<div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_10px_28px_rgba(75,30,37,0.04)]">
								<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">Messaging</p>
								<p className="font-founders mt-3 text-[1.55rem] uppercase tracking-[-0.06em]">Monthly updates</p>
								<p className="mt-2 text-sm leading-6 text-[var(--muted)]">
									Each update includes What&apos;s New plus referenced recurring opportunities.
								</p>
							</div>
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
