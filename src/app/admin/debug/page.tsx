import { AdminDebugConsole } from "@/components/admin-debug-console";
import { requireAdminPageSession } from "@/server/admin/auth";
import { listAdminSubscribers } from "@/server/admin/repository";

export const dynamic = "force-dynamic";

export default async function AdminDebugPage() {
	const session = await requireAdminPageSession();
	const { items, total } = await listAdminSubscribers({ status: "all", limit: 100, offset: 0 });

	return (
		<main className="min-h-screen bg-[linear-gradient(180deg,#f3efe6_0%,#f8fafc_28%,#dffcf7_100%)] px-6 py-8 text-stone-950 sm:px-10">
			<div className="mx-auto max-w-7xl">
				<header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-stone-900/8 pb-6">
					<div>
						<p className="font-mono text-xs uppercase tracking-[0.32em] text-stone-500">Operational admin</p>
						<h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em]">Subscriber and delivery debug</h1>
						<p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
							Inspect subscriber state, resend verification mail, force unsubscribe, and permanently delete records while the funding backend stays in stealth.
						</p>
					</div>
				</header>

				<AdminDebugConsole initialItems={items} initialTotal={total} username={session.username} />
			</div>
		</main>
	);
}
