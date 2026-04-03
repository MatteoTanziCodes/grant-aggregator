"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
		? "border-teal-200 bg-teal-50 text-teal-900"
		: "border-red-200 bg-red-50 text-red-800";
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
			<section className="rounded-[1.75rem] border border-stone-900/10 bg-white/88 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="font-mono text-xs uppercase tracking-[0.28em] text-stone-500">Admin console</p>
						<h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-stone-950">Subscribers</h2>
						<p className="mt-2 text-sm text-stone-600">
							{total} records visible. Signed in as <span className="font-medium text-stone-900">{username}</span>.
						</p>
					</div>
					<button
						type="button"
						onClick={handleLogout}
						className="rounded-full border border-stone-300 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700"
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
						className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none focus:border-teal-600"
					/>
					<select
						value={status}
						onChange={(event) => setStatus(event.target.value as SubscriberFilter)}
						className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none focus:border-teal-600"
					>
						<option value="all">All statuses</option>
						<option value="pending_verification">Pending verification</option>
						<option value="verified">Verified</option>
						<option value="unsubscribed">Unsubscribed</option>
					</select>
				</div>

				{actionState ? (
					<div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${toneClass(actionState.tone)}`}>
						{actionState.message}
					</div>
				) : null}

				<div className="mt-5 space-y-3">
					{isListLoading ? (
						<div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
							Refreshing subscriber list...
						</div>
					) : null}

					{!isListLoading && items.length === 0 ? (
						<div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
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
								className={`w-full rounded-[1.4rem] border px-4 py-4 text-left ${
									isSelected
										? "border-teal-400 bg-teal-50 shadow-[0_12px_40px_rgba(13,148,136,0.12)]"
										: "border-stone-200 bg-stone-50/70"
								}`}
							>
								<div className="flex items-center justify-between gap-3">
									<p className="font-medium text-stone-950">{item.email}</p>
									<span className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700">
										{statusLabel(item.status)}
									</span>
								</div>
								<div className="mt-3 grid gap-1 text-sm text-stone-600">
									<p>Last verification mail: {formatDate(item.lastDeliveryTime)}</p>
									<p>Latest delivery status: {item.lastDeliveryStatus ?? "No attempts yet"}</p>
									{item.lastDeliveryError ? <p className="text-red-700">{item.lastDeliveryError}</p> : null}
								</div>
							</button>
						);
					})}
				</div>
			</section>

			<section className="rounded-[1.75rem] border border-stone-900/10 bg-stone-950 p-5 text-stone-50 shadow-[0_30px_100px_rgba(15,23,42,0.22)]">
				{selectedListItem ? (
					<>
						<div className="flex flex-wrap items-start justify-between gap-4">
							<div>
								<p className="font-mono text-xs uppercase tracking-[0.28em] text-teal-300">Subscriber detail</p>
								<h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em]">{selectedListItem.email}</h2>
								<p className="mt-2 text-sm text-stone-300">
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
									className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-teal-900/60"
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
									className="rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
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
									className="rounded-full border border-red-300/25 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
								>
									{busyAction === "delete" ? "Deleting..." : "Hard delete"}
								</button>
							</div>
						</div>

						<div className="mt-6 grid gap-4 md:grid-cols-2">
							<div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4">
								<p className="font-mono text-xs uppercase tracking-[0.24em] text-stone-400">State</p>
								<dl className="mt-4 space-y-3 text-sm">
									<div className="flex justify-between gap-4">
										<dt className="text-stone-400">Created</dt>
										<dd>{formatDate(selectedListItem.createdAt)}</dd>
									</div>
									<div className="flex justify-between gap-4">
										<dt className="text-stone-400">Updated</dt>
										<dd>{formatDate(selectedListItem.updatedAt)}</dd>
									</div>
									<div className="flex justify-between gap-4">
										<dt className="text-stone-400">Verification sent</dt>
										<dd>{formatDate(selectedListItem.verificationSentAt)}</dd>
									</div>
									<div className="flex justify-between gap-4">
										<dt className="text-stone-400">Verified</dt>
										<dd>{formatDate(selectedListItem.verifiedAt)}</dd>
									</div>
									<div className="flex justify-between gap-4">
										<dt className="text-stone-400">Unsubscribed</dt>
										<dd>{formatDate(selectedListItem.unsubscribedAt)}</dd>
									</div>
									<div className="flex justify-between gap-4">
										<dt className="text-stone-400">Latest delivery</dt>
										<dd>{selectedListItem.lastDeliveryStatus ?? "—"}</dd>
									</div>
								</dl>
							</div>

							<div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4">
								<p className="font-mono text-xs uppercase tracking-[0.24em] text-stone-400">Profile</p>
								{isDetailLoading ? (
									<p className="mt-4 text-sm text-stone-400">Loading detail...</p>
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
									<p className="mt-4 text-sm text-stone-400">No subscriber profile data stored.</p>
								)}
							</div>
						</div>

						<div className="mt-6 grid gap-4 md:grid-cols-2">
							<div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4">
								<p className="font-mono text-xs uppercase tracking-[0.24em] text-stone-400">Recent verification deliveries</p>
								<div className="mt-4 space-y-3">
									{isDetailLoading ? <p className="text-sm text-stone-400">Loading delivery history...</p> : null}
									{!isDetailLoading && detail?.recentDeliveries.length === 0 ? (
										<p className="text-sm text-stone-400">No delivery records yet.</p>
									) : null}
									{detail?.recentDeliveries.map((delivery) => (
										<div key={delivery.id} className="rounded-2xl border border-white/10 bg-black/10 p-3 text-sm">
											<p className="font-medium text-stone-100">{delivery.deliveryStatus}</p>
											<p className="mt-1 text-stone-400">
												{formatDate(delivery.sentAt ?? delivery.createdAt)} · {delivery.deliveryKind}
											</p>
											{delivery.providerMessageId ? (
												<p className="mt-1 text-stone-300">Provider id: {delivery.providerMessageId}</p>
											) : null}
											{delivery.errorMessage ? <p className="mt-1 text-red-200">{delivery.errorMessage}</p> : null}
										</div>
									))}
								</div>
							</div>

							<div className="rounded-[1.4rem] border border-white/10 bg-white/6 p-4">
								<p className="font-mono text-xs uppercase tracking-[0.24em] text-stone-400">Verification token summary</p>
								<div className="mt-4 space-y-3">
									{isDetailLoading ? <p className="text-sm text-stone-400">Loading token state...</p> : null}
									{!isDetailLoading && detail?.tokenSummary.length === 0 ? (
										<p className="text-sm text-stone-400">No verification tokens stored.</p>
									) : null}
									{detail?.tokenSummary.map((token, index) => (
										<div key={`${token.createdAt}-${index}`} className="rounded-2xl border border-white/10 bg-black/10 p-3 text-sm">
											<p>Created: {formatDate(token.createdAt)}</p>
											<p className="mt-1">Expires: {formatDate(token.expiresAt)}</p>
											<p className="mt-1">Consumed: {formatDate(token.consumedAt)}</p>
										</div>
									))}
								</div>
							</div>
						</div>
					</>
				) : (
					<div className="flex min-h-[18rem] items-center justify-center rounded-[1.4rem] border border-dashed border-white/15 bg-white/4 px-6 text-center text-sm text-stone-400">
						Select a subscriber to inspect mail and verification state.
					</div>
				)}
			</section>
		</div>
	);
}
