"use client";

import { useState, type ReactNode } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { cn } from "@/lib/cn";

type SourceSnapshot = {
	id: string;
	name: string;
	kind: string;
	baseUrl: string;
	active: boolean;
	crawlStrategy: string;
	notes: string | null;
};

type RunSnapshot = {
	id: string;
	status: "queued" | "running" | "succeeded" | "failed";
	fetchedUrl: string | null;
	artifactKey: string | null;
	contentHash: string | null;
	discoveredCount: number;
	normalizedCount: number;
	errorMessage: string | null;
	startedAt: string;
	finishedAt: string | null;
};

type ArtifactSnapshot = {
	id: string;
	artifactType: string;
	storageKey: string;
	contentHash: string;
	httpStatus: number | null;
	contentType: string | null;
	finalUrl: string;
	fetchedAt: string;
	sizeBytes: number;
};

type CandidateItem = {
	id: string;
	externalKey: string;
	title: string | null;
	organizationName: string | null;
	fundingTypeText: string | null;
	governmentLevelText: string | null;
	provinceText: string | null;
	amountText: string | null;
	parseError: string | null;
	upsertOutcome: "created" | "updated" | "skipped" | "parse_failed" | null;
	opportunityId: string | null;
	normalizedPayload: Record<string, unknown>;
};

type CandidateSummary = {
	totalCandidates: number;
	parseFailures: number;
	createdCount: number;
	updatedCount: number;
	skippedCount: number;
	items: CandidateItem[];
};

type EventItem = {
	id: string;
	level: "info" | "warn" | "error";
	eventType: string;
	message: string;
	metadata: Record<string, unknown>;
	createdAt: string;
};

export type AdminIngestionSnapshot = {
	source: SourceSnapshot;
	latestRun: RunSnapshot | null;
	latestArtifact: ArtifactSnapshot | null;
	candidateSummary: CandidateSummary | null;
	events: EventItem[];
	description: string;
};

type FailedIngestionRun = {
	source: SourceSnapshot;
	run: RunSnapshot;
	candidateSummary: CandidateSummary | null;
	events: EventItem[];
	assessment: {
		outcome: "excluded_failed" | "excluded_incomplete" | "excluded_empty";
		label: string;
		reason: string;
		completenessRatio: number | null;
	};
};

type MonthlyDigestReport = {
	id: string;
	reportMonth: string;
	slug: string;
	title: string;
	summary: Record<string, unknown>;
	publishedAt: string | null;
};

type ConsoleView = "sources" | "failed";

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

function formatBytes(value: number): string {
	if (value < 1024) {
		return `${value} B`;
	}
	if (value < 1024 * 1024) {
		return `${(value / 1024).toFixed(1)} KB`;
	}
	return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function metadataPreview(metadata: Record<string, unknown>): string {
	return Object.entries(metadata)
		.slice(0, 4)
		.map(([key, value]) => `${key}: ${String(value)}`)
		.join(" · ");
}

function Section({
	title,
	eyebrow,
	children,
	aside,
}: {
	title: string;
	eyebrow: string;
	children: ReactNode;
	aside?: ReactNode;
}) {
	return (
		<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-card)] p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">{eyebrow}</p>
					<h2 className="font-founders mt-2 text-[1.4rem] uppercase tracking-[-0.06em] text-[var(--foreground)]">
						{title}
					</h2>
				</div>
				{aside}
			</div>
			<div className="mt-4">{children}</div>
		</section>
	);
}

export function AdminIngestionConsole({
	initialSnapshots,
	initialFailedRuns,
	initialLatestReport,
	username,
}: {
	initialSnapshots: AdminIngestionSnapshot[];
	initialFailedRuns: FailedIngestionRun[];
	initialLatestReport: MonthlyDigestReport | null;
	username: string;
}) {
	const [snapshots, setSnapshots] = useState(initialSnapshots);
	const [failedRuns, setFailedRuns] = useState(initialFailedRuns);
	const [view, setView] = useState<ConsoleView>("sources");
	const [selectedSourceId, setSelectedSourceId] = useState(initialSnapshots[0]?.source.id ?? "");
	const [selectedFailedRunId, setSelectedFailedRunId] = useState(initialFailedRuns[0]?.run.id ?? "");
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [runningSourceIds, setRunningSourceIds] = useState<string[]>([]);
	const [eventsParent] = useAutoAnimate();

	const sources = snapshots.map((snapshot) => ({
		id: snapshot.source.id,
		label: snapshot.source.name,
		description: snapshot.source.crawlStrategy.replaceAll("-", " "),
		active: snapshot.source.active,
	}));
	const snapshot =
		snapshots.find((item) => item.source.id === selectedSourceId) ?? snapshots[0] ?? null;
	const failedRun =
		failedRuns.find((item) => item.run.id === selectedFailedRunId) ??
		failedRuns[0] ??
		null;
	const selectedSource = sources.find((source) => source.id === selectedSourceId) ?? sources[0];
	const isSelectedSourceRunning = selectedSource ? runningSourceIds.includes(selectedSource.id) : false;

	async function refreshSnapshot(sourceId: string) {
		const response = await fetch(`/api/admin/ingestion/${sourceId}`);
		const payload = (await response.json()) as AdminIngestionSnapshot & { error?: string };
		if (!response.ok) {
			throw new Error(payload.error ?? "Unable to refresh ingestion snapshot.");
		}
		setSnapshots((current) => {
			const hasMatch = current.some((item) => item.source.id === payload.source.id);
			if (!hasMatch) {
				return [...current, payload];
			}
			return current.map((item) => (item.source.id === payload.source.id ? payload : item));
		});
	}

	async function refreshFailedRuns() {
		const response = await fetch("/api/admin/ingestion/failed");
		const payload = (await response.json()) as FailedIngestionRun[] & { error?: string };
		if (!response.ok) {
			throw new Error(payload.error ?? "Unable to refresh failed ingestion runs.");
		}
		setFailedRuns(payload);
		setSelectedFailedRunId((current) =>
			current && payload.some((item) => item.run.id === current)
				? current
				: (payload[0]?.run.id ?? "")
		);
	}

	async function handleRun() {
		const targetSourceId = selectedSourceId;
		if (!targetSourceId) {
			return;
		}

		const targetSourceName =
			snapshots.find((item) => item.source.id === targetSourceId)?.source.name ?? "Source";

		setRunningSourceIds((current) =>
			current.includes(targetSourceId) ? current : [...current, targetSourceId]
		);
		setStatusMessage(null);

		try {
			const response = await fetch(`/api/admin/ingestion/${targetSourceId}`, { method: "POST" });
			const payload = (await response.json()) as
				| { snapshot?: AdminIngestionSnapshot; error?: string }
				| { error?: string };

			if (!response.ok) {
				throw new Error("error" in payload ? payload.error ?? "Ingestion failed." : "Ingestion failed.");
			}

			if ("snapshot" in payload && payload.snapshot) {
				setSnapshots((current) => {
					const hasMatch = current.some((item) => item.source.id === payload.snapshot?.source.id);
					if (!hasMatch) {
						return payload.snapshot ? [...current, payload.snapshot] : current;
					}
					return current.map((item) =>
						item.source.id === payload.snapshot?.source.id ? payload.snapshot : item
					);
				});
			} else {
				await refreshSnapshot(targetSourceId);
			}

			await refreshFailedRuns();
			setStatusMessage(`${targetSourceName} ingestion completed.`);
		} catch (error) {
			setStatusMessage(error instanceof Error ? error.message : "Ingestion failed.");
		} finally {
			setRunningSourceIds((current) => current.filter((item) => item !== targetSourceId));
		}
	}

	if (!snapshot || !selectedSource) {
		return null;
	}

	return (
		<div className="grid gap-5 xl:grid-cols-[0.34fr_0.66fr]">
			<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_14px_40px_rgba(75,30,37,0.05)]">
				<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">Ingestion</p>
				<h1 className="font-founders mt-3 text-[2rem] uppercase tracking-[-0.08em] text-[var(--foreground)]">Sources</h1>
				<p className="mt-3 text-sm leading-7 text-[var(--muted)]">
					Inspect source runs, review monthly report output, and isolate failed or incomplete jobs. Signed in as{" "}
					<span className="font-medium text-[var(--foreground)]">{username}</span>.
				</p>

				<div className="mt-6 grid grid-cols-2 gap-2">
					<button
						type="button"
						onClick={() => setView("sources")}
						className={cn(
							"font-founders rounded-[var(--radius-box)] border px-3 py-2 text-[11px] uppercase tracking-[0.14em]",
							view === "sources"
								? "border-[var(--accent)] bg-[var(--surface-soft)] text-[var(--accent)]"
								: "border-[var(--border)] bg-[var(--surface-card)] text-[var(--muted)]"
						)}
					>
						Sources
					</button>
					<button
						type="button"
						onClick={() => setView("failed")}
						className={cn(
							"font-founders rounded-[var(--radius-box)] border px-3 py-2 text-[11px] uppercase tracking-[0.14em]",
							view === "failed"
								? "border-[var(--accent)] bg-[var(--surface-soft)] text-[var(--accent)]"
								: "border-[var(--border)] bg-[var(--surface-card)] text-[var(--muted)]"
						)}
					>
						Failed
					</button>
				</div>

				<div className="mt-6 space-y-3">
					{view === "sources"
						? sources.map((source) => {
								const isSelected = source.id === selectedSource.id;

								return (
									<button
										key={source.id}
										type="button"
										onClick={() => setSelectedSourceId(source.id)}
										className={cn(
											"w-full rounded-[var(--radius-box)] border px-4 py-4 text-left",
											isSelected
												? "border-[var(--accent)] bg-[var(--surface-soft)] shadow-[0_10px_28px_rgba(75,30,37,0.06)]"
												: "border-[var(--border)] bg-[var(--surface-card)]"
										)}
									>
										<div className="flex flex-wrap items-center justify-between gap-2">
											<p className="font-medium text-[var(--foreground)]">{source.label}</p>
											<span className="font-founders rounded-[var(--radius-chip)] border border-[var(--border)] bg-white px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
												{source.active ? "Active" : "Inactive"}
											</span>
										</div>
										<p className="mt-2 text-sm text-[var(--muted)]">{source.description}</p>
									</button>
								);
						  })
						: failedRuns.length === 0 ? (
							<div className="rounded-[var(--radius-box)] border border-dashed border-[var(--border)] bg-[var(--surface-card)] px-4 py-8 text-center text-sm text-[var(--muted)]">
								No failed or incomplete ingestion runs right now.
							</div>
						) : (
							failedRuns.map((item) => {
								const isSelected = item.run.id === failedRun?.run.id;
								return (
									<button
										key={item.run.id}
										type="button"
										onClick={() => setSelectedFailedRunId(item.run.id)}
										className={cn(
											"w-full rounded-[var(--radius-box)] border px-4 py-4 text-left",
											isSelected
												? "border-[var(--accent)] bg-[var(--surface-soft)] shadow-[0_10px_28px_rgba(75,30,37,0.06)]"
												: "border-[var(--border)] bg-[var(--surface-card)]"
										)}
									>
										<div className="flex flex-wrap items-center justify-between gap-2">
											<p className="font-medium text-[var(--foreground)]">{item.source.name}</p>
											<span className="font-founders rounded-[var(--radius-chip)] border border-[var(--danger-border)] bg-[var(--danger-surface)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
												{item.assessment.label}
											</span>
										</div>
										<p className="mt-2 text-sm text-[var(--muted)]">
											{formatDate(item.run.startedAt)} · {item.run.normalizedCount}/{item.run.discoveredCount} normalized
										</p>
									</button>
								);
							})
						)}
				</div>
			</section>

			<div className="space-y-5">
				{view === "sources" ? (
					<>
						<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_14px_40px_rgba(75,30,37,0.05)]">
							<div className="flex flex-wrap items-center justify-between gap-4">
								<div>
									<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">{selectedSource.description}</p>
									<h2 className="font-founders mt-3 text-[2.1rem] uppercase tracking-[-0.08em] text-[var(--foreground)]">
										{selectedSource.label}
									</h2>
									<p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
										{snapshot.description}
									</p>
								</div>
								<button
									type="button"
									onClick={() => void handleRun()}
									disabled={isSelectedSourceRunning}
									className="font-founders rounded-[var(--radius-box)] bg-[var(--accent)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white disabled:cursor-not-allowed disabled:bg-[color:rgba(139,35,50,0.5)]"
								>
									{isSelectedSourceRunning ? "Running..." : "Run ingestion"}
								</button>
							</div>

							{statusMessage ? (
								<div className="mt-4 rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] px-4 py-3 text-sm text-[var(--foreground)]">
									{statusMessage}
								</div>
							) : null}
						</section>

						{initialLatestReport ? (
							<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_14px_40px_rgba(75,30,37,0.05)]">
								<div className="flex flex-wrap items-center justify-between gap-4">
									<div>
										<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">Monthly report</p>
										<h2 className="font-founders mt-3 text-[1.8rem] uppercase tracking-[-0.08em] text-[var(--foreground)]">
											{initialLatestReport.title}
										</h2>
										<p className="mt-3 text-sm leading-7 text-[var(--muted)]">
											Published {formatDate(initialLatestReport.publishedAt)}. This resource is the link used for monthly digest emails.
										</p>
									</div>
									<a
										href={`/reports/monthly/${initialLatestReport.slug}`}
										target="_blank"
										rel="noreferrer"
										className="font-founders rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]"
									>
										Open report
									</a>
								</div>
							</section>
						) : null}

						<div className="grid gap-5 lg:grid-cols-2">
							<Section eyebrow="Source" title="Configured target">
								<dl className="space-y-3 text-sm">
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Source id</dt><dd>{snapshot.source.id}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Kind</dt><dd>{snapshot.source.kind}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Active</dt><dd>{snapshot.source.active ? "Yes" : "No"}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Strategy</dt><dd>{snapshot.source.crawlStrategy}</dd></div>
									<div className="grid gap-1"><dt className="text-[var(--muted)]">Base URL</dt><dd className="break-all">{snapshot.source.baseUrl}</dd></div>
									{snapshot.source.notes ? <div className="grid gap-1"><dt className="text-[var(--muted)]">Notes</dt><dd>{snapshot.source.notes}</dd></div> : null}
								</dl>
							</Section>

							<Section eyebrow="Latest run" title="Crawl status">
								{snapshot.latestRun ? (
									<dl className="space-y-3 text-sm">
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Status</dt><dd>{snapshot.latestRun.status}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Started</dt><dd>{formatDate(snapshot.latestRun.startedAt)}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Finished</dt><dd>{formatDate(snapshot.latestRun.finishedAt)}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Parsed candidates</dt><dd>{snapshot.latestRun.discoveredCount}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Normalized upserts</dt><dd>{snapshot.latestRun.normalizedCount}</dd></div>
										<div className="grid gap-1"><dt className="text-[var(--muted)]">Fetched URL</dt><dd className="break-all">{snapshot.latestRun.fetchedUrl ?? "—"}</dd></div>
										{snapshot.latestRun.errorMessage ? <div className="grid gap-1"><dt className="text-[var(--muted)]">Error</dt><dd className="text-[var(--accent)]">{snapshot.latestRun.errorMessage}</dd></div> : null}
									</dl>
								) : (
									<p className="text-sm text-[var(--muted)]">No crawl has run yet for this source.</p>
								)}
							</Section>

							<Section eyebrow="Artifact" title="Raw page snapshot">
								{snapshot.latestArtifact ? (
									<dl className="space-y-3 text-sm">
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Type</dt><dd>{snapshot.latestArtifact.artifactType}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">HTTP status</dt><dd>{snapshot.latestArtifact.httpStatus ?? "—"}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Size</dt><dd>{formatBytes(snapshot.latestArtifact.sizeBytes)}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Fetched</dt><dd>{formatDate(snapshot.latestArtifact.fetchedAt)}</dd></div>
										<div className="grid gap-1"><dt className="text-[var(--muted)]">Storage key</dt><dd className="break-all">{snapshot.latestArtifact.storageKey}</dd></div>
										<div className="grid gap-1"><dt className="text-[var(--muted)]">Content type</dt><dd>{snapshot.latestArtifact.contentType ?? "—"}</dd></div>
										<div className="grid gap-1"><dt className="text-[var(--muted)]">Final URL</dt><dd className="break-all">{snapshot.latestArtifact.finalUrl}</dd></div>
									</dl>
								) : (
									<p className="text-sm text-[var(--muted)]">
										No artifact metadata found for the latest run. If `CRAWL_ARTIFACTS` is not configured, the crawl still runs but storage is skipped explicitly.
									</p>
								)}
							</Section>

							<Section eyebrow="Candidates" title="Parse and upsert summary">
								{snapshot.candidateSummary ? (
									<dl className="space-y-3 text-sm">
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Parsed rows</dt><dd>{snapshot.candidateSummary.totalCandidates}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Parse failures</dt><dd>{snapshot.candidateSummary.parseFailures}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Created opportunities</dt><dd>{snapshot.candidateSummary.createdCount}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Updated opportunities</dt><dd>{snapshot.candidateSummary.updatedCount}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Skipped</dt><dd>{snapshot.candidateSummary.skippedCount}</dd></div>
									</dl>
								) : (
									<p className="text-sm text-[var(--muted)]">No candidate extraction has been recorded yet.</p>
								)}
							</Section>
						</div>

						<Section eyebrow="Observability" title="Candidate rows">
							{snapshot.candidateSummary?.items.length ? (
								<div className="space-y-3">
									{snapshot.candidateSummary.items.map((item) => (
										<div key={item.id} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-white p-4 text-sm">
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div>
													<p className="font-medium text-[var(--foreground)]">{item.title ?? item.externalKey}</p>
													<p className="mt-1 text-[var(--muted)]">
														{item.organizationName ?? "Unknown organization"} · {item.amountText ?? "No amount"} · {item.provinceText ?? "No province"}
													</p>
												</div>
												<span
													className={cn(
														"font-founders rounded-[var(--radius-chip)] border px-3 py-1 text-[10px] uppercase tracking-[0.12em]",
														item.upsertOutcome === "parse_failed"
															? "border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--accent)]"
															: "border-[var(--border)] bg-[var(--surface-card)] text-[var(--accent)]"
													)}
												>
													{item.upsertOutcome ?? "pending"}
												</span>
											</div>
											<p className="mt-2 text-[var(--muted)]">
												{item.fundingTypeText ?? "Unknown type"} · {item.governmentLevelText ?? "Unknown level"}
											</p>
											{item.parseError ? <p className="mt-2 text-[var(--accent)]">{item.parseError}</p> : null}
											{Object.keys(item.normalizedPayload).length > 0 ? (
												<p className="mt-2 text-[var(--muted)]">{metadataPreview(item.normalizedPayload)}</p>
											) : null}
										</div>
									))}
								</div>
							) : (
								<p className="text-sm text-[var(--muted)]">No candidate rows stored for the latest run.</p>
							)}
						</Section>

						<Section eyebrow="Crawl log" title="Structured events">
							<div ref={eventsParent} className="space-y-3">
								{snapshot.events.length === 0 ? (
									<p className="text-sm text-[var(--muted)]">No crawl events recorded yet.</p>
								) : (
									snapshot.events.map((event) => (
										<div key={event.id} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-white p-4 text-sm">
											<div className="flex flex-wrap items-center justify-between gap-3">
												<p className="font-medium text-[var(--foreground)]">{event.eventType}</p>
												<span className="font-founders rounded-[var(--radius-chip)] border border-[var(--border)] bg-[var(--surface-card)] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
													{event.level}
												</span>
											</div>
											<p className="mt-1 text-[var(--muted)]">{formatDate(event.createdAt)}</p>
											<p className="mt-2 text-[var(--foreground)]">{event.message}</p>
											{Object.keys(event.metadata).length > 0 ? (
												<p className="mt-2 text-[var(--muted)]">{metadataPreview(event.metadata)}</p>
											) : null}
										</div>
									))
								)}
							</div>
						</Section>
					</>
				) : failedRun ? (
					<>
						<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_14px_40px_rgba(75,30,37,0.05)]">
							<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">Failed job</p>
							<h2 className="font-founders mt-3 text-[2.1rem] uppercase tracking-[-0.08em] text-[var(--foreground)]">
								{failedRun.source.name}
							</h2>
							<p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
								{failedRun.assessment.reason}
							</p>
						</section>

						<div className="grid gap-5 lg:grid-cols-2">
							<Section eyebrow="Source" title="Failed target">
								<dl className="space-y-3 text-sm">
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Source id</dt><dd>{failedRun.source.id}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Kind</dt><dd>{failedRun.source.kind}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Strategy</dt><dd>{failedRun.source.crawlStrategy}</dd></div>
									<div className="grid gap-1"><dt className="text-[var(--muted)]">Base URL</dt><dd className="break-all">{failedRun.source.baseUrl}</dd></div>
								</dl>
							</Section>

							<Section eyebrow="Assessment" title="Why it was excluded">
								<dl className="space-y-3 text-sm">
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Status</dt><dd>{failedRun.run.status}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Started</dt><dd>{formatDate(failedRun.run.startedAt)}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Finished</dt><dd>{formatDate(failedRun.run.finishedAt)}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Discovered</dt><dd>{failedRun.run.discoveredCount}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Normalized</dt><dd>{failedRun.run.normalizedCount}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Completeness</dt><dd>{failedRun.assessment.completenessRatio !== null ? `${(failedRun.assessment.completenessRatio * 100).toFixed(0)}%` : "—"}</dd></div>
									{failedRun.run.errorMessage ? <div className="grid gap-1"><dt className="text-[var(--muted)]">Error</dt><dd className="text-[var(--accent)]">{failedRun.run.errorMessage}</dd></div> : null}
								</dl>
							</Section>
						</div>

						<Section eyebrow="Candidate rows" title="Observed output">
							{failedRun.candidateSummary ? (
								<dl className="space-y-3 text-sm">
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Parsed rows</dt><dd>{failedRun.candidateSummary.totalCandidates}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Parse failures</dt><dd>{failedRun.candidateSummary.parseFailures}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Created</dt><dd>{failedRun.candidateSummary.createdCount}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Updated</dt><dd>{failedRun.candidateSummary.updatedCount}</dd></div>
									<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Skipped</dt><dd>{failedRun.candidateSummary.skippedCount}</dd></div>
								</dl>
							) : (
								<p className="text-sm text-[var(--muted)]">No candidate observations were stored for this failed run.</p>
							)}
						</Section>

						<Section eyebrow="Error log" title="Structured events">
							<div className="space-y-3">
								{failedRun.events.length === 0 ? (
									<p className="text-sm text-[var(--muted)]">No crawl events recorded for this run.</p>
								) : (
									failedRun.events.map((event) => (
										<div key={event.id} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-white p-4 text-sm">
											<div className="flex flex-wrap items-center justify-between gap-3">
												<p className="font-medium text-[var(--foreground)]">{event.eventType}</p>
												<span className="font-founders rounded-[var(--radius-chip)] border border-[var(--border)] bg-[var(--surface-card)] px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
													{event.level}
												</span>
											</div>
											<p className="mt-1 text-[var(--muted)]">{formatDate(event.createdAt)}</p>
											<p className="mt-2 text-[var(--foreground)]">{event.message}</p>
											{Object.keys(event.metadata).length > 0 ? (
												<pre className="mt-2 overflow-x-auto rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-3 text-xs leading-6 text-[var(--muted)]">
													{JSON.stringify(event.metadata, null, 2)}
												</pre>
											) : null}
										</div>
									))
								)}
							</div>
						</Section>
					</>
				) : (
					<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-8 text-sm text-[var(--muted)]">
						No failed or incomplete ingestion runs to inspect.
					</section>
				)}
			</div>
		</div>
	);
}
