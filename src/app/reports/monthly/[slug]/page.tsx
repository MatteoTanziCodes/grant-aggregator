import { notFound } from "next/navigation";
import { getMonthlyDigestReportBySlug } from "@/server/monthly-digest/repository";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
	if (!value) {
		return "—";
	}

	return new Intl.DateTimeFormat("en-CA", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "America/Toronto",
	}).format(new Date(value));
}

export default async function MonthlyDigestReportPage(props: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await props.params;
	const report = await getMonthlyDigestReportBySlug(slug);

	if (!report) {
		notFound();
	}

	return (
		<main className="relative min-h-screen overflow-hidden bg-[var(--background)] px-6 py-10 text-[var(--foreground)] sm:px-10">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-x-0 top-0 h-px bg-[var(--border)]" />
			</div>

			<div className="relative mx-auto max-w-6xl space-y-6">
				<header className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[0_14px_40px_rgba(75,30,37,0.05)]">
					<p className="font-founders text-[11px] uppercase tracking-[0.32em] text-[var(--accent)]">
						Monthly digest
					</p>
					<h1 className="font-founders mt-4 text-[2.7rem] uppercase tracking-[-0.08em] text-balance">
						{report.title}
					</h1>
					<p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--muted)]">
						Compiled from the latest included ingestion runs for the month. Failed or mostly incomplete runs are excluded from this resource automatically.
					</p>

					<div className="mt-8 grid gap-4 sm:grid-cols-3">
						<div className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-4">
							<p className="font-founders text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">Published</p>
							<p className="mt-2 text-sm text-[var(--foreground)]">{formatDate(report.publishedAt)}</p>
						</div>
						<div className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-4">
							<p className="font-founders text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">Included sources</p>
							<p className="mt-2 text-sm text-[var(--foreground)]">{report.body.includedSources.length}</p>
						</div>
						<div className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-4">
							<p className="font-founders text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">Opportunities</p>
							<p className="mt-2 text-sm text-[var(--foreground)]">{report.body.opportunities.length}</p>
						</div>
					</div>
				</header>

				<section className="grid gap-6 lg:grid-cols-[0.42fr_0.58fr]">
					<div className="space-y-6">
						<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6">
							<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Included</p>
							<h2 className="font-founders mt-3 text-[1.7rem] uppercase tracking-[-0.06em]">Source runs</h2>
							<div className="mt-5 space-y-3">
								{report.body.includedSources.map((source) => (
									<div key={`${source.sourceId}-${source.crawlRunId ?? "none"}`} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-4 text-sm">
										<p className="font-medium text-[var(--foreground)]">{source.sourceName}</p>
										<p className="mt-2 text-[var(--muted)]">
											{source.normalizedCount}/{source.discoveredCount} normalized
											{source.completenessRatio !== null
												? ` · ${(source.completenessRatio * 100).toFixed(0)}% complete`
												: ""}
										</p>
										<p className="mt-2 text-[var(--muted)]">{source.reason}</p>
									</div>
								))}
							</div>
						</section>

						<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6">
							<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Excluded</p>
							<h2 className="font-founders mt-3 text-[1.7rem] uppercase tracking-[-0.06em]">Skipped runs</h2>
							<div className="mt-5 space-y-3">
								{report.body.excludedSources.length === 0 ? (
									<p className="text-sm text-[var(--muted)]">No source runs were excluded for this digest.</p>
								) : (
									report.body.excludedSources.map((source) => (
										<div key={`${source.sourceId}-${source.crawlRunId ?? "none"}`} className="rounded-[var(--radius-box)] border border-[var(--danger-border)] bg-[var(--danger-surface)] p-4 text-sm">
											<p className="font-medium text-[var(--foreground)]">{source.sourceName}</p>
											<p className="mt-2 text-[var(--foreground)]">{source.reason}</p>
											{source.errorMessage ? <p className="mt-2 text-[var(--accent)]">{source.errorMessage}</p> : null}
										</div>
									))
								)}
							</div>
						</section>
					</div>

					<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-6">
						<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Resource</p>
						<h2 className="font-founders mt-3 text-[1.7rem] uppercase tracking-[-0.06em]">Opportunity summary</h2>
						<div className="mt-5 space-y-4">
							{report.body.opportunities.length === 0 ? (
								<p className="text-sm text-[var(--muted)]">No opportunity updates were captured in the included source runs.</p>
							) : (
								report.body.opportunities.map((opportunity) => (
									<article key={opportunity.opportunityId} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-4 text-sm">
										<div className="flex flex-wrap items-start justify-between gap-3">
											<div>
												<h3 className="font-medium text-[var(--foreground)]">{opportunity.title}</h3>
												<p className="mt-1 text-[var(--muted)]">
													{opportunity.organizationName} · {opportunity.sourceName}
												</p>
											</div>
											<span className="font-founders rounded-[var(--radius-chip)] border border-[var(--border)] bg-white px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
												{opportunity.fundingCategory.replaceAll("_", " ")}
											</span>
										</div>
										<p className="mt-3 text-[var(--foreground)]">
											{opportunity.amountText ?? "Amount varies"} · {opportunity.deadlineText ?? "Deadline not specified"}
										</p>
										{opportunity.summary ? <p className="mt-3 leading-6 text-[var(--muted)]">{opportunity.summary}</p> : null}
										<div className="mt-4 flex flex-wrap items-center gap-3 text-[var(--muted)]">
											<span>Updated {formatDate(opportunity.updatedAt)}</span>
											{opportunity.provinceCodes.length > 0 ? <span>{opportunity.provinceCodes.join(", ")}</span> : null}
											<a href={opportunity.programUrl} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)]">
												Open program
											</a>
										</div>
									</article>
								))
							)}
						</div>
					</section>
				</section>
			</div>
		</main>
	);
}
