import { AdminIngestionConsole } from "@/components/admin-ingestion-console";
import { requireAdminPageSession } from "@/server/admin/auth";
import {
	listAdminIngestionSnapshots,
	listFailedAdminIngestionRuns,
} from "@/server/admin/ingestion-repository";
import { getLatestMonthlyDigestReport } from "@/server/monthly-digest/repository";

export const dynamic = "force-dynamic";

function isGrantCompassMigrationError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	return (
		error.message.includes("no such table: crawl_discovery_candidates") ||
		error.message.includes("no such column: truth_tier") ||
		error.message.includes("no such column: origin_source_id") ||
		error.message.includes("no such column: discovery_key") ||
		error.message.includes("no such table: monthly_digest_batches") ||
		error.message.includes("no such table: monthly_digest_reports") ||
		error.message.includes("no such table: monthly_digest_batch_sources")
	);
}

export default async function AdminIngestionPage() {
	const session = await requireAdminPageSession();
	let data:
		| {
				snapshots: Awaited<ReturnType<typeof listAdminIngestionSnapshots>>;
				failedRuns: Awaited<ReturnType<typeof listFailedAdminIngestionRuns>>;
				latestReport: Awaited<ReturnType<typeof getLatestMonthlyDigestReport>>;
		  }
		| null = null;
	let missingMigration = false;

	try {
		const [snapshots, failedRuns, latestReport] = await Promise.all([
			listAdminIngestionSnapshots(),
			listFailedAdminIngestionRuns(),
			getLatestMonthlyDigestReport(),
		]);
		data = { snapshots, failedRuns, latestReport };
	} catch (error) {
		if (!isGrantCompassMigrationError(error)) {
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
					<section className="rounded-[var(--radius-panel)] border border-[var(--danger-border)] bg-[var(--danger-surface)] p-6">
						<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Missing migration</p>
						<h1 className="font-founders mt-3 text-[2.3rem] uppercase tracking-[-0.07em]">Ingestion schema required</h1>
						<p className="mt-4 text-sm leading-7 text-[var(--foreground)]">
							This deployment is missing the ingestion reporting schema. Apply migrations <code>0006_grantcompass_discovery_slice.sql</code> and <code>0008_monthly_digest_workflow.sql</code>, then reload the page.
						</p>
						<pre className="mt-5 overflow-x-auto rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-xs leading-6 text-[var(--foreground)]">
npx wrangler d1 execute grant-aggregator --remote --file=./migrations/d1/0006_grantcompass_discovery_slice.sql
npx wrangler d1 execute grant-aggregator --remote --file=./migrations/d1/0008_monthly_digest_workflow.sql
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
				<AdminIngestionConsole
					initialSnapshots={data.snapshots}
					initialFailedRuns={data.failedRuns}
					initialLatestReport={data.latestReport}
					username={session.username}
				/>
			</div>
		</main>
	);
}
