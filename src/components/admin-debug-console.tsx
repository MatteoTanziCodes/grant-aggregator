"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import Balancer from "react-wrap-balancer";
import { cn } from "@/lib/cn";

type AdminSubscriberStatus = "pending_verification" | "verified" | "unsubscribed";
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
	lastDeliveryStatus: string | null;
	lastDeliveryTime: string | null;
	lastDeliveryError: string | null;
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
	recentDeliveries: Array<{
		id: string;
		deliveryKind: string;
		deliveryStatus: string;
		providerMessageId: string | null;
		errorMessage: string | null;
		sentAt: string | null;
		createdAt: string;
	}>;
	tokenSummary: Array<{
		createdAt: string;
		expiresAt: string;
		consumedAt: string | null;
	}>;
};

type ListResponse = {
	items: AdminSubscriberListItem[];
	total: number;
	error?: string;
};

type ActionState = {
	tone: "success" | "error";
	message: string;
};

function formatDate(value: string | null): string {
	if (!value) {
		return "—";
	}

	return new Intl.DateTimeFormat("en-CA", {
		dateStyle: "medium",
		timeStyle: "short",
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

function toneClass(tone: ActionState["tone"]): string {
	return tone === "success"
		? "border-[var(--border)] bg-[var(--surface-soft)] text-[var(--foreground)]"
		: "border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--foreground)]";
}

async function readJson<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

export function AdminDebugConsole({
	initialItems,
	initialTotal,
	username,
}: {
	initialItems: AdminSubscriberListItem[];
	initialTotal: number;
	username: string;
}) {
	const router = useRouter();
	const [listParent] = useAutoAnimate();
	const [detailParent] = useAutoAnimate();
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState<SubscriberFilter>("all");
	const [items, setItems] = useState(initialItems);
	const [total, setTotal] = useState(initialTotal);
	const [selectedId, setSelectedId] = useState(initialItems[0]?.id ?? null);
	const [detail, setDetail] = useState<AdminSubscriberDetail | null>(null);
	const [isListLoading, setIsListLoading] = useState(false);
	const [isDetailLoading, setIsDetailLoading] = useState(false);
	const [actionState, setActionState] = useState<ActionState | null>(null);
	const [busyAction, setBusyAction] = useState<string | null>(null);

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
				const response = await fetch(`/api/admin/subscribers/${selectedId}`, {
					signal: controller.signal,
				});
				const payload = await readJson<(AdminSubscriberDetail & { error?: string }) | { error?: string }>(response);

				if (!response.ok) {
					throw new Error("error" in payload ? payload.error ?? "Unable to load subscriber detail." : "Unable to load subscriber detail.");
				}

				setDetail(payload as AdminSubscriberDetail);
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

			await refreshList(nextSelectedId ?? selectedId);
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

	const selectedListItem = items.find((item) => item.id === selectedId) ?? null;

	return (
		<div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
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
									<p>Latest delivery status: {item.lastDeliveryStatus ?? "No attempts yet"}</p>
									{item.lastDeliveryError ? <p className="text-[var(--accent)]">{item.lastDeliveryError}</p> : null}
								</div>
							</button>
						);
					})}
				</div>
			</section>

			<section className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-strong)] p-5 text-[var(--foreground)] shadow-[0_14px_40px_rgba(75,30,37,0.05)]">
				{selectedListItem ? (
					<div ref={detailParent}>
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
										if (!window.confirm(`Permanently delete ${selectedListItem.email} and related records?`)) {
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

						<div className="mt-6 grid gap-4 md:grid-cols-2">
							<div className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-4">
								<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">State</p>
								<dl className="mt-4 space-y-3 text-sm">
									<div className="flex justify-between gap-4">
										<dt className="text-[var(--muted)]">Created</dt>
										<dd>{formatDate(selectedListItem.createdAt)}</dd>
									</div>
									<div className="flex justify-between gap-4">
										<dt className="text-[var(--muted)]">Updated</dt>
										<dd>{formatDate(selectedListItem.updatedAt)}</dd>
									</div>
									<div className="flex justify-between gap-4">
										<dt className="text-[var(--muted)]">Verification sent</dt>
										<dd>{formatDate(selectedListItem.verificationSentAt)}</dd>
									</div>
									<div className="flex justify-between gap-4">
										<dt className="text-[var(--muted)]">Verified</dt>
										<dd>{formatDate(selectedListItem.verifiedAt)}</dd>
									</div>
									<div className="flex justify-between gap-4">
										<dt className="text-[var(--muted)]">Unsubscribed</dt>
										<dd>{formatDate(selectedListItem.unsubscribedAt)}</dd>
									</div>
									<div className="flex justify-between gap-4">
										<dt className="text-[var(--muted)]">Latest delivery</dt>
										<dd>{selectedListItem.lastDeliveryStatus ?? "—"}</dd>
									</div>
								</dl>
							</div>

							<div className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-4">
								<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Profile</p>
								{isDetailLoading ? (
									<p className="mt-4 text-sm text-[var(--muted)]">Loading detail...</p>
								) : detail?.profile ? (
									<div className="mt-4 space-y-3 text-sm">
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
									<p className="mt-4 text-sm text-[var(--muted)]">No subscriber profile data stored.</p>
								)}
							</div>
						</div>

						<div className="mt-6 grid gap-4 md:grid-cols-2">
							<div className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-4">
								<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Recent verification deliveries</p>
								<div className="mt-4 space-y-3">
									{isDetailLoading ? <p className="text-sm text-[var(--muted)]">Loading delivery history...</p> : null}
									{!isDetailLoading && detail?.recentDeliveries.length === 0 ? (
										<p className="text-sm text-[var(--muted)]">No delivery records yet.</p>
									) : null}
									{detail?.recentDeliveries.map((delivery) => (
										<div key={delivery.id} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-white p-3 text-sm">
											<p className="font-medium text-[var(--foreground)]">{delivery.deliveryStatus}</p>
											<p className="mt-1 text-[var(--muted)]">
												{formatDate(delivery.sentAt ?? delivery.createdAt)} · {delivery.deliveryKind}
											</p>
											{delivery.providerMessageId ? (
												<p className="mt-1 text-[var(--muted)]">Provider id: {delivery.providerMessageId}</p>
											) : null}
											{delivery.errorMessage ? <p className="mt-1 text-[var(--accent)]">{delivery.errorMessage}</p> : null}
										</div>
									))}
								</div>
							</div>

							<div className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-4">
								<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Verification token summary</p>
								<div className="mt-4 space-y-3">
									{isDetailLoading ? <p className="text-sm text-[var(--muted)]">Loading token state...</p> : null}
									{!isDetailLoading && detail?.tokenSummary.length === 0 ? (
										<p className="text-sm text-[var(--muted)]">No verification tokens stored.</p>
									) : null}
									{detail?.tokenSummary.map((token, index) => (
										<div key={`${token.createdAt}-${index}`} className="rounded-[var(--radius-box)] border border-[var(--border)] bg-white p-3 text-sm">
											<p>Created: {formatDate(token.createdAt)}</p>
											<p className="mt-1">Expires: {formatDate(token.expiresAt)}</p>
											<p className="mt-1">Consumed: {formatDate(token.consumedAt)}</p>
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				) : (
					<div className="flex min-h-[18rem] items-center justify-center rounded-[var(--radius-box)] border border-dashed border-[var(--border)] bg-[var(--surface-card)] px-6 text-center text-sm text-[var(--muted)]">
						Select a subscriber to inspect mail and verification state.
					</div>
				)}
			</section>
		</div>
	);
}
