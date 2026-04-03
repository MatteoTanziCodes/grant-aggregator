import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { readAdminSession } from "@/server/admin/auth";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
	const session = await readAdminSession();

	if (session) {
		redirect("/admin/debug");
	}

	return (
		<main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f1efe7_0%,#f8fafc_44%,#ddfbf2_100%)] px-6 py-10 text-stone-950 sm:px-10">
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute left-[-10rem] top-[-6rem] h-[20rem] w-[20rem] rounded-full bg-amber-300/25 blur-3xl" />
				<div className="absolute right-[-8rem] top-[16rem] h-[22rem] w-[22rem] rounded-full bg-teal-300/25 blur-3xl" />
			</div>

			<div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
				<section className="grid w-full overflow-hidden rounded-[2rem] border border-stone-900/10 bg-white/88 shadow-[0_32px_120px_rgba(15,23,42,0.14)] backdrop-blur lg:grid-cols-[0.9fr_1.1fr]">
					<div className="bg-stone-950 px-8 py-10 text-stone-50">
						<p className="font-mono text-xs uppercase tracking-[0.32em] text-teal-300">Grant Aggregator</p>
						<h1 className="mt-4 text-4xl font-semibold tracking-[-0.06em]">Admin debug access</h1>
						<p className="mt-4 text-sm leading-7 text-stone-300">
							Internal-only console for subscriber state, verification deliveries, resend operations, and hard deletes.
						</p>
						<div className="mt-10 space-y-4">
							<div className="rounded-[1.3rem] border border-white/10 bg-white/6 p-4">
								<p className="font-medium">Step 1</p>
								<p className="mt-2 text-sm text-stone-300">Enter the shared admin username and password.</p>
							</div>
							<div className="rounded-[1.3rem] border border-white/10 bg-white/6 p-4">
								<p className="font-medium">Step 2</p>
								<p className="mt-2 text-sm text-stone-300">Confirm with the 6-digit authenticator code for the admin TOTP secret.</p>
							</div>
						</div>
					</div>

					<div className="px-8 py-10 sm:px-10">
						<p className="font-mono text-xs uppercase tracking-[0.28em] text-stone-500">Two-factor sign-in</p>
						<h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] text-stone-950">Open the console</h2>
						<p className="mt-3 text-sm leading-7 text-stone-600">
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
