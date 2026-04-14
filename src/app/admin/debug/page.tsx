import { AdminDebugConsole } from "@/components/admin-debug-console";
import { requireAdminPageSession } from "@/server/admin/auth";
import { getAdminOverview, listAdminSubscribers } from "@/server/admin/repository";

export const dynamic = "force-dynamic";

function isObservabilityMigrationError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	return (
		error.message.includes("no such table: email_events") ||
		error.message.includes("no such table: admin_audit_log")
	);
}

export default async function AdminDebugPage() {
	const session = await requireAdminPageSession();
	let data:
		| {
				items: Awaited<ReturnType<typeof listAdminSubscribers>>["items"];
				total: number;
				overview: Awaited<ReturnType<typeof getAdminOverview>>;
		  }
		| null = null;
	let missingMigration = false;

	try {
		const [{ items, total }, overview] = await Promise.all([
			listAdminSubscribers({ status: "all", limit: 100, offset: 0 }),
			getAdminOverview({ staleHours: 72 }),
		]);
		data = { items, total, overview };
	} catch (error) {
		if (!isObservabilityMigrationError(error)) {
			throw error;
		}
		missingMigration = true;
	}

	if (missingMigration || !data) {
		return (
			<main className="relative min-h-screen overflow-hidden bg-[var(--background)] px-6 py-8 text-[var(--foreground)] sm:px-10">
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute inset-x-0 top-0 h-px bg-[var(--border)]" />
				</div>
				<div className="mx-auto max-w-5xl">
					<header className="relative mb-8 border-b border-[var(--border)] pb-6">
						<p className="font-founders text-[11px] uppercase tracking-[0.32em] text-[var(--accent)]">Operational admin</p>
						<h1 className="font-founders mt-3 max-w-4xl text-[2.6rem] uppercase tracking-[-0.08em] text-balance">Admin schema update required</h1>
					</header>

					<section className="rounded-[var(--radius-panel)] border border-[var(--danger-border)] bg-[var(--danger-surface)] p-6">
						<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Missing migration</p>
						<p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--foreground)]">
							This deployment expects the email observability tables from migration <code>0002_email_observability.sql</code>, but the production D1 database does not have them yet.
						</p>
						<p className="mt-4 text-sm leading-7 text-[var(--foreground)]">
							Apply the remote migration, redeploy if needed, and then reload this page.
						</p>
						<pre className="mt-5 overflow-x-auto rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-xs leading-6 text-[var(--foreground)]">
							npx wrangler d1 execute grant-aggregator --remote --file=./migrations/d1/0002_email_observability.sql
						</pre>
					</section>
				</div>
			</main>
		);
	}

	return (
		<main className="relative min-h-screen overflow-hidden bg-[var(--background)] px-6 py-8 text-[var(--foreground)] sm:px-10">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-x-0 top-0 h-px bg-[var(--border)]" />
			</div>
				<div className="mx-auto max-w-7xl">
					<header className="relative mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--border)] pb-6">
						<div>
							<p className="font-founders text-[11px] uppercase tracking-[0.32em] text-[var(--accent)]">Operational admin</p>
							<h1 className="font-founders mt-3 max-w-4xl text-[2.6rem] uppercase tracking-[-0.08em] text-balance">Subscriber and delivery debug</h1>
							<p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted)]">
								Inspect subscriber state, resend verification mail, force unsubscribe, and permanently delete records while the funding backend stays in stealth.
							</p>
						</div>
						<a
							href="/admin/ingestion"
							className="font-founders rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]"
						>
							Sources
						</a>
					</header>

				<AdminDebugConsole
					initialItems={data.items}
					initialTotal={data.total}
					initialOverview={data.overview}
					username={session.username}
				/>
			</div>
		</main>
	);
}
