import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { readAdminSession } from "@/server/admin/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
	const session = await readAdminSession();

	if (session) {
		redirect("/admin/debug");
	}

	return (
		<main className="relative min-h-screen overflow-hidden bg-[var(--background)] px-6 py-10 text-[var(--foreground)] sm:px-10">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-x-0 top-0 h-px bg-[var(--border)]" />
			</div>

			<div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
				<section className="grid w-full gap-4 lg:grid-cols-[0.95fr_1.05fr]">
					<div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-8 shadow-[0_14px_40px_rgba(75,30,37,0.05)]">
						<p className="font-founders text-[11px] uppercase tracking-[0.32em] text-[var(--accent)]">Operational admin</p>
						<h1 className="font-founders mt-4 max-w-xl text-[2.6rem] uppercase leading-[0.96] tracking-[-0.08em] text-balance">
							Admin access for subscriber and delivery operations
						</h1>
						<p className="mt-5 max-w-lg text-sm leading-7 text-[var(--muted)]">
							Internal-only console for subscriber state, verification deliveries, resend operations, and hard deletes.
						</p>
						<div className="mt-10 space-y-4">
							<div className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-4">
								<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Step 1</p>
								<p className="mt-2 text-sm text-[var(--foreground)]">Enter the shared admin username and password.</p>
							</div>
							<div className="rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] p-4">
								<p className="font-founders text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">Step 2</p>
								<p className="mt-2 text-sm text-[var(--foreground)]">Confirm with the 6-digit authenticator code for the admin TOTP secret.</p>
							</div>
						</div>
					</div>

					<div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-strong)] px-8 py-10 shadow-[0_14px_40px_rgba(75,30,37,0.05)] sm:px-10">
						<p className="font-founders text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">Two-factor sign-in</p>
						<h2 className="font-founders mt-4 text-[2.2rem] uppercase tracking-[-0.07em] text-[var(--foreground)] text-balance">
							Open the console
						</h2>
						<p className="mt-3 max-w-md text-sm leading-7 text-[var(--muted)]">
							This panel is intentionally narrow in scope and is protected by a signed session cookie issued only after TOTP passes.
						</p>
						<div className="mt-8">
							<AdminLoginForm />
						</div>
					</div>
				</section>
			</div>
		</main>
	);
}
