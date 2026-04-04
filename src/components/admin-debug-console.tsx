"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import Balancer from "react-wrap-balancer";
import { cn } from "@/lib/cn";

type AdminSubscriberStatus = "pending_verification" | "verified" | "unsubscribed";
type AdminEmailEventStatus = "queued" | "sent" | "failed" | "skipped";
type SubscriberFilter = "all" | AdminSubscriberStatus;

type AdminSubscriberListItem = {
	id: string;
	email: string;
	status: AdminSubscriberStatus;
	sourceLabel: string | null;
	createdAt: string;
	updatedAt: string;
	verificationSentAt: string | null;
	verifiedAt: string | null;
	unsubscribedAt: string | null;
	lastDeliveryStatus: AdminEmailEventStatus | null;
	lastDeliveryTime: string | null;
	lastDeliveryError: string | null;
};

type AdminEmailEventItem = {
	id: string;
	emailType: string;
	recipientEmail: string;
	subscriberId: string | null;
	verificationTokenId: string | null;
	providerName: string;
	providerMessageId: string | null;
	triggeredByType: "user" | "admin" | "system";
	triggeredByUser: string | null;
	resultStatus: AdminEmailEventStatus;
	providerResponseSummary: string | null;
	errorCode: string | null;
	errorMessage: string | null;
	attemptedAt: string;
	canReplay: boolean;
};

type AdminTokenSummaryItem = {
	id: string;
	createdAt: string;
	expiresAt: string;
	consumedAt: string | null;
	status: "active" | "expired" | "consumed";
};

type AdminAuditLogItem = {
	id: string;
	adminUsername: string;
	actionType: string;
	targetSubscriberId: string | null;
	targetEmailEventId: string | null;
	metadata: Record<string, unknown>;
	createdAt: string;
};

type AdminStaleSubscriberItem = {
	id: string;
	email: string;
	sourceLabel: string | null;
	verificationSentAt: string;
	hoursPending: number;
};

type AdminOverview = {
	failedEmailEvents: AdminEmailEventItem[];
	stalePendingSubscribers: AdminStaleSubscriberItem[];
	auditLog: AdminAuditLogItem[];
};

type AdminSubscriberDetail = AdminSubscriberListItem & {
	profile: {
		companyName: string | null;
		businessStage: string | null;
		employeeBand: string | null;
		annualRevenueBand: string | null;
		provinces: string[];
		industries: string[];
		fundingNeeds: string[];
		founderTraits: string[];
		notes: string | null;
	} | null;
	emailTimeline: AdminEmailEventItem[];
	resendHistory: AdminEmailEventItem[];
	tokenSummary: AdminTokenSummaryItem[];
};

type ListResponse = {
	items: AdminSubscriberListItem[];
	total: number;
	error?: string;
};

type OverviewResponse = AdminOverview & {
	error?: string;
};

type ActionState = {
	tone: "success" | "error";
	message: string;
};

type PanelKey =
	| "manualTest"
	| "failedSends"
	| "stalePending"
	| "auditLog"
	| "subscriberState"
	| "profile"
	| "timeline"
	| "resendHistory"
	| "tokenHistory";

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

function statusLabel(status: AdminSubscriberStatus): string {
	switch (status) {
		case "pending_verification":
			return "Pending";
		case "verified":
			return "Verified";
		case "unsubscribed":
			return "Unsubscribed";
	}
}

function eventStatusLabel(status: AdminEmailEventStatus): string {
	switch (status) {
		case "queued":
			return "Queued";
		case "sent":
			return "Sent";
		case "failed":
			return "Failed";
		case "skipped":
			return "Skipped";
	}
}

function tokenStatusLabel(status: AdminTokenSummaryItem["status"]): string {
	switch (status) {
		case "active":
			return "Active";
		case "consumed":
			return "Consumed";
		case "expired":
			return "Expired";
	}
}

function humanizeEventType(value: string): string {
	return value.replace(/_/g, " ");
}

function humanizeActionType(value: string): string {
	return value.replace(/_/g, " ");
}

function toneClass(tone: ActionState["tone"]): string {
	return tone === "success"
		? "border-[var(--border)] bg-[var(--surface-soft)] text-[var(--foreground)]"
		: "border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--foreground)]";
}

async function readJson<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

function metadataPreview(metadata: Record<string, unknown>): string {
	const parts = Object.entries(metadata)
		.slice(0, 2)
		.map(([key, value]) => `${key}: ${String(value)}`);
	return parts.join(" · ");
}

function CollapsiblePanel({
	eyebrow,
	title,
	open,
	onToggle,
	aside,
	children,
	className,
}: {
	eyebrow: string;
	title: string;
	open: boolean;
	onToggle: () => void;
	aside?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-card)] p-4",
				className
			)}
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">{eyebrow}</p>
					<h3 className="font-founders mt-2 text-[1.2rem] uppercase tracking-[-0.06em] text-[var(--foreground)]">
						{title}
					</h3>
				</div>
				<div className="flex items-center gap-2">
					{aside}
					<button
						type="button"
						onClick={onToggle}
						className="font-founders rounded-[var(--radius-chip)] border border-[var(--border)] bg-white px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]"
					>
						{open ? "Hide" : "Show"}
					</button>
				</div>
			</div>
			{open ? <div className="mt-4">{children}</div> : null}
		</section>
	);
}

export function AdminDebugConsole({
	initialItems,
	initialTotal,
	initialOverview,
	username,
}: {
	initialItems: AdminSubscriberListItem[];
	initialTotal: number;
	initialOverview: AdminOverview;
	username: string;
}) {
	const router = useRouter();
	const [listParent] = useAutoAnimate();
	const [detailParent] = useAutoAnimate();
	const [overviewParent] = useAutoAnimate();
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState<SubscriberFilter>("all");
	const [items, setItems] = useState(initialItems);
	const [total, setTotal] = useState(initialTotal);
	const [selectedId, setSelectedId] = useState(initialItems[0]?.id ?? null);
	const [detail, setDetail] = useState<AdminSubscriberDetail | null>(null);
	const [overview, setOverview] = useState(initialOverview);
	const [isListLoading, setIsListLoading] = useState(false);
	const [isDetailLoading, setIsDetailLoading] = useState(false);
	const [isOverviewLoading, setIsOverviewLoading] = useState(false);
	const [actionState, setActionState] = useState<ActionState | null>(null);
	const [busyAction, setBusyAction] = useState<string | null>(null);
	const [staleHours, setStaleHours] = useState("72");
	const [testEmail, setTestEmail] = useState("");
	const [collapsedPanels, setCollapsedPanels] = useState<Record<PanelKey, boolean>>({
		manualTest: false,
		failedSends: false,
		stalePending: false,
		auditLog: true,
		subscriberState: false,
		profile: true,
		timeline: false,
		resendHistory: true,
		tokenHistory: true,
	});

	function togglePanel(panel: PanelKey) {
		setCollapsedPanels((current) => ({
			...current,
			[panel]: !current[panel],
		}));
	}

	async function loadSubscriberDetail(subscriberId: string, signal?: AbortSignal) {
		const response = await fetch(`/api/admin/subscribers/${subscriberId}`, { signal });
		const payload = await readJson<(AdminSubscriberDetail & { error?: string }) | { error?: string }>(response);

		if (!response.ok) {
			throw new Error("error" in payload ? payload.error ?? "Unable to load subscriber detail." : "Unable to load subscriber detail.");
		}

		return payload as AdminSubscriberDetail;
	}

	async function refreshOverview() {
		const response = await fetch(`/api/admin/overview?staleHours=${encodeURIComponent(staleHours)}`);
		const payload = await readJson<OverviewResponse>(response);

		if (!response.ok) {
			throw new Error(payload.error ?? "Unable to refresh admin overview.");
		}

		setOverview(payload);
	}

	useEffect(() => {
		const controller = new AbortController();

		async function loadList() {
			setIsListLoading(true);
			try {
				const search = new URLSearchParams();
				if (query.trim()) {
					search.set("q", query.trim());
				}
				search.set("status", status);
				search.set("limit", "100");

				const response = await fetch(`/api/admin/subscribers?${search.toString()}`, {
					signal: controller.signal,
				});
				const payload = await readJson<ListResponse>(response);

				if (!response.ok) {
					throw new Error(payload.error ?? "Unable to load subscribers.");
				}

				setItems(payload.items);
				setTotal(payload.total);
				setSelectedId((current) =>
					current && payload.items.some((item) => item.id === current) ? current : (payload.items[0]?.id ?? null)
				);
			} catch (error) {
				if (!controller.signal.aborted) {
					setActionState({
						tone: "error",
						message: error instanceof Error ? error.message : "Unable to load subscribers.",
					});
				}
			} finally {
				if (!controller.signal.aborted) {
					setIsListLoading(false);
				}
			}
		}

		void loadList();

		return () => controller.abort();
	}, [query, status]);

	useEffect(() => {
		if (!selectedId) {
			setDetail(null);
			return;
		}

		const controller = new AbortController();

		async function loadDetail() {
			setIsDetailLoading(true);
			try {
				const payload = await loadSubscriberDetail(selectedId, controller.signal);
				setDetail(payload);
			} catch (error) {
				if (!controller.signal.aborted) {
					setActionState({
						tone: "error",
						message: error instanceof Error ? error.message : "Unable to load subscriber detail.",
					});
				}
			} finally {
				if (!controller.signal.aborted) {
					setIsDetailLoading(false);
				}
			}
		}

		void loadDetail();

		return () => controller.abort();
	}, [selectedId]);

	useEffect(() => {
		const controller = new AbortController();

		async function loadOverview() {
			setIsOverviewLoading(true);
			try {
				const response = await fetch(`/api/admin/overview?staleHours=${encodeURIComponent(staleHours)}`, {
					signal: controller.signal,
				});
				const payload = await readJson<OverviewResponse>(response);

				if (!response.ok) {
					throw new Error(payload.error ?? "Unable to load admin overview.");
				}

				setOverview(payload);
			} catch (error) {
				if (!controller.signal.aborted) {
					setActionState({
						tone: "error",
						message: error instanceof Error ? error.message : "Unable to load admin overview.",
					});
				}
			} finally {
				if (!controller.signal.aborted) {
					setIsOverviewLoading(false);
				}
			}
		}

		void loadOverview();

		return () => controller.abort();
	}, [staleHours]);

	async function refreshList(targetId?: string | null) {
		const search = new URLSearchParams();
		if (query.trim()) {
			search.set("q", query.trim());
		}
		search.set("status", status);
		search.set("limit", "100");

		const response = await fetch(`/api/admin/subscribers?${search.toString()}`);
		const payload = await readJson<ListResponse>(response);

		if (!response.ok) {
			throw new Error(payload.error ?? "Unable to refresh subscribers.");
		}

		setItems(payload.items);
		setTotal(payload.total);

		const nextSelectedId =
			targetId && payload.items.some((item) => item.id === targetId)
				? targetId
				: (payload.items[0]?.id ?? null);
		setSelectedId(nextSelectedId);

		if (nextSelectedId) {
			setDetail(await loadSubscriberDetail(nextSelectedId));
		} else {
			setDetail(null);
		}
	}

	async function handleAction(
		actionKey: string,
		requestFactory: () => Promise<Response>,
		successMessage: string,
		nextSelectedId?: string | null
	) {
		setBusyAction(actionKey);
		setActionState(null);

		try {
			const response = await requestFactory();
			const payload = await readJson<{ error?: string }>(response);

			if (!response.ok) {
				throw new Error(payload.error ?? "Admin action failed.");
			}

			await Promise.all([refreshList(nextSelectedId ?? selectedId), refreshOverview()]);
			setActionState({ tone: "success", message: successMessage });
		} catch (error) {
			setActionState({
				tone: "error",
				message: error instanceof Error ? error.message : "Admin action failed.",
			});
		} finally {
			setBusyAction(null);
		}
	}

	async function handleLogout() {
		await fetch("/api/admin/session", { method: "DELETE" });
		router.replace("/admin/login");
		router.refresh();
	}

	async function handleManualTestSend() {
		await handleAction(
			"manual-test",
			() =>
				fetch("/api/admin/test-send", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ email: testEmail }),
				}),
			`Test email sent to ${testEmail}.`
		);
	}

	async function handleReplayEmailEvent(emailEventId: string) {
		await handleAction(
			`replay-${emailEventId}`,
			() =>
				fetch(`/api/admin/email-events/${emailEventId}/replay`, {
					method: "POST",
				}),
			"Email replay triggered."
		);
	}

	const selectedListItem = items.find((item) => item.id === selectedId) ?? null;

	return (
		<div className="grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
			<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[0_14px_40px_rgba(75,30,37,0.05)]">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">Admin console</p>
						<h2 className="font-founders mt-2 text-[1.9rem] uppercase tracking-[-0.07em] text-[var(--foreground)]">
							<Balancer>Subscribers</Balancer>
						</h2>
						<p className="mt-2 text-sm text-[var(--muted)]">
							{total} records visible. Signed in as <span className="font-medium text-[var(--foreground)]">{username}</span>.
						</p>
					</div>
					<button
						type="button"
						onClick={handleLogout}
						className="font-founders rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]"
					>
						Log out
					</button>
				</div>

				<div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
					<input
						type="search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search email"
						className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
					/>
					<select
						value={status}
						onChange={(event) => setStatus(event.target.value as SubscriberFilter)}
						className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
					>
						<option value="all">All statuses</option>
						<option value="pending_verification">Pending verification</option>
						<option value="verified">Verified</option>
						<option value="unsubscribed">Unsubscribed</option>
					</select>
				</div>

				{actionState ? (
					<div className={`mt-4 rounded-[var(--radius-box)] border px-4 py-3 text-sm ${toneClass(actionState.tone)}`}>
						{actionState.message}
					</div>
				) : null}

				<div ref={listParent} className="mt-5 space-y-3">
					{isListLoading ? (
						<div className="rounded-[var(--radius-box)] border border-dashed border-[var(--border)] bg-[var(--surface-card)] px-4 py-8 text-center text-sm text-[var(--muted)]">
							Refreshing subscriber list...
						</div>
					) : null}
					{!isListLoading && items.length === 0 ? (
						<div className="rounded-[var(--radius-box)] border border-dashed border-[var(--border)] bg-[var(--surface-card)] px-4 py-8 text-center text-sm text-[var(--muted)]">
							No subscribers match the current filter.
						</div>
					) : null}

					{items.map((item) => {
						const isSelected = item.id === selectedId;

						return (
							<button
								key={item.id}
								type="button"
								onClick={() => setSelectedId(item.id)}
								className={cn(
									"w-full rounded-[var(--radius-box)] border px-4 py-4 text-left",
									isSelected
										? "border-[var(--accent)] bg-[var(--surface-soft)] shadow-[0_10px_28px_rgba(75,30,37,0.06)]"
										: "border-[var(--border)] bg-[var(--surface-card)]"
								)}
							>
								<div className="flex items-center justify-between gap-3">
									<p className="font-medium text-[var(--foreground)]">{item.email}</p>
									<span className="font-founders rounded-[var(--radius-chip)] border border-[var(--border)] bg-white px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--accent)]">
										{statusLabel(item.status)}
									</span>
								</div>
								<div className="mt-3 grid gap-1 text-sm text-[var(--muted)]">
									<p>Last verification mail: {formatDate(item.lastDeliveryTime)}</p>
									<p>Latest delivery status: {item.lastDeliveryStatus ? eventStatusLabel(item.lastDeliveryStatus) : "No attempts yet"}</p>
									{item.lastDeliveryError ? <p className="text-[var(--accent)]">{item.lastDeliveryError}</p> : null}
								</div>
							</button>
						);
					})}
				</div>
			</section>

			<div className="space-y-4">
				<div ref={overviewParent} className="grid gap-4 xl:grid-cols-2">
					<CollapsiblePanel eyebrow="Debug utility" title="Manual test send" open={!collapsedPanels.manualTest} onToggle={() => togglePanel("manualTest")}>
						<div className="space-y-3">
							<input
								type="email"
								value={testEmail}
								onChange={(event) => setTestEmail(event.target.value)}
								placeholder="operator@company.com"
								className="w-full rounded-[var(--radius-box)] border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
							/>
							<button
								type="button"
								disabled={busyAction === "manual-test" || !testEmail.trim()}
								onClick={() => void handleManualTestSend()}
								className="font-founders rounded-[var(--radius-box)] bg-[var(--accent)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white disabled:cursor-not-allowed disabled:bg-[color:rgba(139,35,50,0.5)]"
							>
								{busyAction === "manual-test" ? "Sending..." : "Send test email"}
							</button>
							<p className="text-sm leading-6 text-[var(--muted)]">
								Sends a plain provider health-check email and records the full event in the timeline.
							</p>
						</div>
					</CollapsiblePanel>

					<CollapsiblePanel
						eyebrow="Observability"
						title="Failed sends"
						open={!collapsedPanels.failedSends}
						onToggle={() => togglePanel("failedSends")}
						aside={isOverviewLoading ? <span className="text-xs text-[var(--muted)]">Refreshing...</span> : null}
					>
						<div className="space-y-3">
							{overview.failedEmailEvents.length === 0 ? <p className="text-sm text-[var(--muted)]">No failed email events right now.</p> : null}
							{overview.failedEmailEvents.map((event) => (
								<div key={event.id} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-white p-3 text-sm">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<p className="font-medium text-[var(--foreground)]">{event.recipientEmail}</p>
										<span className="font-founders rounded-[var(--radius-chip)] border border-[var(--danger-border)] bg-[var(--danger-surface)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
											{eventStatusLabel(event.resultStatus)}
										</span>
									</div>
									<p className="mt-2 text-[var(--muted)]">
										{humanizeEventType(event.emailType)} · {formatDate(event.attemptedAt)}
									</p>
									{event.errorMessage ? <p className="mt-2 text-[var(--accent)]">{event.errorMessage}</p> : null}
									{event.canReplay ? (
										<button
											type="button"
											disabled={busyAction === `replay-${event.id}`}
											onClick={() => void handleReplayEmailEvent(event.id)}
											className="font-founders mt-3 rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--accent)] disabled:opacity-50"
										>
											{busyAction === `replay-${event.id}` ? "Replaying..." : "Replay"}
										</button>
									) : null}
								</div>
							))}
						</div>
					</CollapsiblePanel>

					<CollapsiblePanel
						eyebrow="Subscriber follow-up"
						title="Pending too long"
						open={!collapsedPanels.stalePending}
						onToggle={() => togglePanel("stalePending")}
						aside={
							<select
								value={staleHours}
								onChange={(event) => setStaleHours(event.target.value)}
								className="rounded-[var(--radius-chip)] border border-[var(--border)] bg-white px-3 py-1 text-[11px] uppercase tracking-[0.08em] text-[var(--foreground)] outline-none"
							>
								<option value="24">24h</option>
								<option value="48">48h</option>
								<option value="72">72h</option>
								<option value="168">7d</option>
							</select>
						}
					>
						<div className="space-y-3">
							{overview.stalePendingSubscribers.length === 0 ? <p className="text-sm text-[var(--muted)]">No stale pending subscribers for this window.</p> : null}
							{overview.stalePendingSubscribers.map((subscriber) => (
								<button
									key={subscriber.id}
									type="button"
									onClick={() => setSelectedId(subscriber.id)}
									className="w-full rounded-[var(--radius-box)] border border-[var(--border)] bg-white p-3 text-left text-sm"
								>
									<p className="font-medium text-[var(--foreground)]">{subscriber.email}</p>
									<p className="mt-1 text-[var(--muted)]">
										{subscriber.hoursPending}h pending · sent {formatDate(subscriber.verificationSentAt)}
									</p>
								</button>
							))}
						</div>
					</CollapsiblePanel>

					<CollapsiblePanel eyebrow="Safety" title="Admin audit log" open={!collapsedPanels.auditLog} onToggle={() => togglePanel("auditLog")}>
						<div className="space-y-3">
							{overview.auditLog.length === 0 ? <p className="text-sm text-[var(--muted)]">No admin audit entries yet.</p> : null}
							{overview.auditLog.map((entry) => (
								<div key={entry.id} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-white p-3 text-sm">
									<p className="font-medium text-[var(--foreground)]">
										{entry.adminUsername} · {humanizeActionType(entry.actionType)}
									</p>
									<p className="mt-1 text-[var(--muted)]">{formatDate(entry.createdAt)}</p>
									{Object.keys(entry.metadata).length > 0 ? <p className="mt-2 text-[var(--muted)]">{metadataPreview(entry.metadata)}</p> : null}
								</div>
							))}
						</div>
					</CollapsiblePanel>
				</div>

				<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-strong)] p-5 text-[var(--foreground)] shadow-[0_14px_40px_rgba(75,30,37,0.05)]">
					{selectedListItem ? (
						<div ref={detailParent} className="space-y-4">
							<div className="flex flex-wrap items-start justify-between gap-4">
								<div>
									<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">Subscriber detail</p>
									<h2 className="font-founders mt-3 text-[1.8rem] uppercase tracking-[-0.07em]">
										<Balancer>{selectedListItem.email}</Balancer>
									</h2>
									<p className="mt-2 text-sm text-[var(--muted)]">
										Status: {statusLabel(selectedListItem.status)}. Source: {selectedListItem.sourceLabel ?? "—"}.
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									<button
										type="button"
										disabled={busyAction === "resend" || selectedListItem.status !== "pending_verification"}
										onClick={() =>
											void handleAction(
												"resend",
												() =>
													fetch(`/api/admin/subscribers/${selectedListItem.id}/resend-verification`, {
														method: "POST",
													}),
												"Verification email re-sent."
											)
										}
										className="font-founders rounded-[var(--radius-box)] bg-[var(--accent)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-white disabled:cursor-not-allowed disabled:bg-[color:rgba(139,35,50,0.5)]"
									>
										{busyAction === "resend" ? "Sending..." : "Resend verification"}
									</button>
									<button
										type="button"
										disabled={busyAction === "unsubscribe" || selectedListItem.status === "unsubscribed"}
										onClick={() => {
											if (!window.confirm(`Force unsubscribe ${selectedListItem.email}?`)) {
												return;
											}

											void handleAction(
												"unsubscribe",
												() =>
													fetch(`/api/admin/subscribers/${selectedListItem.id}/unsubscribe`, {
														method: "POST",
													}),
												"Subscriber unsubscribed."
											);
										}}
										className="font-founders rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
									>
										{busyAction === "unsubscribe" ? "Updating..." : "Force unsubscribe"}
									</button>
									<button
										type="button"
										disabled={busyAction === "delete"}
										onClick={() => {
											if (!window.confirm(`Permanently delete ${selectedListItem.email} and related records? This cannot be undone.`)) {
												return;
											}

											void handleAction(
												"delete",
												() =>
													fetch(`/api/admin/subscribers/${selectedListItem.id}`, {
														method: "DELETE",
													}),
												"Subscriber deleted.",
												null
											);
										}}
										className="font-founders rounded-[var(--radius-box)] border border-[var(--danger-border)] bg-[var(--danger-surface)] px-4 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
									>
										{busyAction === "delete" ? "Deleting..." : "Hard delete"}
									</button>
								</div>
							</div>

							<div className="grid gap-4 xl:grid-cols-2">
								<CollapsiblePanel eyebrow="Subscriber" title="State" open={!collapsedPanels.subscriberState} onToggle={() => togglePanel("subscriberState")}>
									<dl className="space-y-3 text-sm">
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Created</dt><dd>{formatDate(selectedListItem.createdAt)}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Updated</dt><dd>{formatDate(selectedListItem.updatedAt)}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Verification sent</dt><dd>{formatDate(selectedListItem.verificationSentAt)}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Verified</dt><dd>{formatDate(selectedListItem.verifiedAt)}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Unsubscribed</dt><dd>{formatDate(selectedListItem.unsubscribedAt)}</dd></div>
										<div className="flex justify-between gap-4"><dt className="text-[var(--muted)]">Latest delivery</dt><dd>{selectedListItem.lastDeliveryStatus ? eventStatusLabel(selectedListItem.lastDeliveryStatus) : "—"}</dd></div>
									</dl>
								</CollapsiblePanel>

								<CollapsiblePanel eyebrow="Subscriber" title="Profile" open={!collapsedPanels.profile} onToggle={() => togglePanel("profile")}>
									{isDetailLoading ? (
										<p className="text-sm text-[var(--muted)]">Loading detail...</p>
									) : detail?.profile ? (
										<div className="space-y-3 text-sm">
											<p>Company: {detail.profile.companyName ?? "—"}</p>
											<p>Stage: {detail.profile.businessStage ?? "—"}</p>
											<p>Employees: {detail.profile.employeeBand ?? "—"}</p>
											<p>Revenue: {detail.profile.annualRevenueBand ?? "—"}</p>
											<p>Provinces: {detail.profile.provinces.join(", ") || "—"}</p>
											<p>Industries: {detail.profile.industries.join(", ") || "—"}</p>
											<p>Funding needs: {detail.profile.fundingNeeds.join(", ") || "—"}</p>
											<p>Founder traits: {detail.profile.founderTraits.join(", ") || "—"}</p>
											<p>Notes: {detail.profile.notes ?? "—"}</p>
										</div>
									) : (
										<p className="text-sm text-[var(--muted)]">No subscriber profile data stored.</p>
									)}
								</CollapsiblePanel>
							</div>

							<CollapsiblePanel eyebrow="Observability" title="Email timeline" open={!collapsedPanels.timeline} onToggle={() => togglePanel("timeline")}>
								<div className="space-y-3">
									{isDetailLoading ? <p className="text-sm text-[var(--muted)]">Loading timeline...</p> : null}
									{!isDetailLoading && detail?.emailTimeline.length === 0 ? <p className="text-sm text-[var(--muted)]">No email events recorded for this subscriber.</p> : null}
									{detail?.emailTimeline.map((event) => (
										<div key={event.id} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-white p-3 text-sm">
											<div className="flex flex-wrap items-center justify-between gap-3">
												<p className="font-medium text-[var(--foreground)]">{humanizeEventType(event.emailType)} · {eventStatusLabel(event.resultStatus)}</p>
												<span className="font-founders rounded-[var(--radius-chip)] border border-[var(--border)] bg-[var(--surface-card)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">
													{event.triggeredByType}{event.triggeredByUser ? `:${event.triggeredByUser}` : ""}
												</span>
											</div>
											<p className="mt-1 text-[var(--muted)]">{formatDate(event.attemptedAt)} · provider {event.providerName}</p>
											{event.providerMessageId ? <p className="mt-1 text-[var(--muted)]">Provider id: {event.providerMessageId}</p> : null}
											{event.errorCode || event.errorMessage ? <p className="mt-2 text-[var(--accent)]">{event.errorCode ? `${event.errorCode}: ` : ""}{event.errorMessage}</p> : null}
											{event.providerResponseSummary ? <p className="mt-2 break-all text-[var(--muted)]">{event.providerResponseSummary}</p> : null}
											{event.canReplay ? (
												<button
													type="button"
													disabled={busyAction === `replay-${event.id}`}
													onClick={() => void handleReplayEmailEvent(event.id)}
													className="font-founders mt-3 rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[var(--accent)] disabled:opacity-50"
												>
													{busyAction === `replay-${event.id}` ? "Replaying..." : "Replay event"}
												</button>
											) : null}
										</div>
									))}
								</div>
							</CollapsiblePanel>

							<div className="grid gap-4 xl:grid-cols-2">
								<CollapsiblePanel eyebrow="Observability" title="Resend history" open={!collapsedPanels.resendHistory} onToggle={() => togglePanel("resendHistory")}>
									<div className="space-y-3">
										{isDetailLoading ? <p className="text-sm text-[var(--muted)]">Loading resend history...</p> : null}
										{!isDetailLoading && detail?.resendHistory.length === 0 ? <p className="text-sm text-[var(--muted)]">No admin-triggered resend history yet.</p> : null}
										{detail?.resendHistory.map((event) => (
											<div key={event.id} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-white p-3 text-sm">
												<p className="font-medium text-[var(--foreground)]">{eventStatusLabel(event.resultStatus)}</p>
												<p className="mt-1 text-[var(--muted)]">{formatDate(event.attemptedAt)}</p>
												{event.errorMessage ? <p className="mt-2 text-[var(--accent)]">{event.errorMessage}</p> : null}
											</div>
										))}
									</div>
								</CollapsiblePanel>

								<CollapsiblePanel eyebrow="Token state" title="Verification tokens" open={!collapsedPanels.tokenHistory} onToggle={() => togglePanel("tokenHistory")}>
									<div className="space-y-3">
										{isDetailLoading ? <p className="text-sm text-[var(--muted)]">Loading token state...</p> : null}
										{!isDetailLoading && detail?.tokenSummary.length === 0 ? <p className="text-sm text-[var(--muted)]">No verification tokens stored.</p> : null}
										{detail?.tokenSummary.map((token) => (
											<div key={token.id} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-white p-3 text-sm">
												<div className="flex items-center justify-between gap-3">
													<p className="font-medium text-[var(--foreground)]">{tokenStatusLabel(token.status)}</p>
													<span className="font-founders rounded-[var(--radius-chip)] border border-[var(--border)] bg-[var(--surface-card)] px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--accent)]">{token.id.slice(0, 8)}</span>
												</div>
												<p className="mt-2 text-[var(--muted)]">Created: {formatDate(token.createdAt)}</p>
												<p className="mt-1 text-[var(--muted)]">Expires: {formatDate(token.expiresAt)}</p>
												<p className="mt-1 text-[var(--muted)]">Consumed: {formatDate(token.consumedAt)}</p>
											</div>
										))}
									</div>
								</CollapsiblePanel>
							</div>
						</div>
					) : (
						<div className="flex min-h-[18rem] items-center justify-center rounded-[var(--radius-box)] border border-dashed border-[var(--border)] bg-[var(--surface-card)] px-6 text-center text-sm text-[var(--muted)]">
							Select a subscriber to inspect email history, token issuance, and admin actions.
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
