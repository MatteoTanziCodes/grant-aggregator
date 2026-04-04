import { AdminDebugConsole } from "@/components/admin-debug-console";
import { requireAdminPageSession } from "@/server/admin/auth";
import { getAdminOverview, listAdminSubscribers } from "@/server/admin/repository";
import Balancer from "react-wrap-balancer";

export const dynamic = "force-dynamic";

export default async function AdminDebugPage() {
	const session = await requireAdminPageSession();
	const [{ items, total }, overview] = await Promise.all([
		listAdminSubscribers({ status: "all", limit: 100, offset: 0 }),
		getAdminOverview({ staleHours: 72 }),
	]);

	return (
		<main className="relative min-h-screen overflow-hidden bg-[var(--background)] px-6 py-8 text-[var(--foreground)] sm:px-10">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-x-0 top-0 h-px bg-[var(--border)]" />
			</div>
			<div className="mx-auto max-w-7xl">
				<header className="relative mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-6">
					<div>
						<p className="font-founders text-[11px] uppercase tracking-[0.32em] text-[var(--accent)]">Operational admin</p>
						<h1 className="font-founders mt-3 max-w-4xl text-[2.6rem] uppercase tracking-[-0.08em]">
							<Balancer>Subscriber and delivery debug</Balancer>
						</h1>
						<p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
							Inspect subscriber state, resend verification mail, force unsubscribe, and permanently delete records while the funding backend stays in stealth.
						</p>
					</div>
				</header>

				<AdminDebugConsole
					initialItems={items}
					initialTotal={total}
					initialOverview={overview}
					username={session.username}
				/>
			</div>
		</main>
	);
}
