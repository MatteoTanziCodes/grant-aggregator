"use client";

import { useState } from "react";

type SubscribeResponse = {
	status?: "verification_sent" | "already_verified";
	email?: string;
	verificationUrl?: string;
	error?: string;
};

export function SignupForm() {
	const [email, setEmail] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [result, setResult] = useState<SubscribeResponse | null>(null);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSubmitting(true);
		setResult(null);

		try {
			const response = await fetch("/api/subscribe", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ email }),
			});

			const payload = (await response.json()) as SubscribeResponse;

			if (!response.ok) {
				throw new Error(payload.error ?? "Unable to submit email.");
			}

			setResult(payload);
			if (payload.status === "verification_sent") {
				setEmail("");
			}
		} catch (error) {
			setResult({
				error: error instanceof Error ? error.message : "Unable to submit email.",
			});
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-[0_12px_34px_rgba(75,30,37,0.06)] sm:p-6">
			<p className="font-founders mb-4 text-[11px] uppercase tracking-[0.28em] text-[var(--accent)]">
				Get verified for monthly funding updates
			</p>
			<form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]" onSubmit={handleSubmit}>
				<label className="sr-only" htmlFor="email">
					Email
				</label>
				<input
					id="email"
					type="email"
					value={email}
					onChange={(event) => setEmail(event.target.value)}
					required
					autoComplete="email"
					placeholder="founder@company.com"
					className="min-w-0 w-full rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-card)] px-4 py-3 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:bg-white"
				/>
				<button
					type="submit"
					disabled={isSubmitting}
					className="font-founders w-full rounded-[var(--radius-box)] bg-[var(--accent)] px-5 py-3 text-xs uppercase tracking-[0.18em] text-white hover:bg-[var(--accent-deep)] disabled:cursor-not-allowed disabled:bg-[color:rgba(139,35,50,0.5)]"
				>
					{isSubmitting ? "Sending link..." : "Get verification link"}
				</button>
			</form>
			<p className="mt-3 text-sm leading-6 text-[var(--muted)]">
				No account, no password. Verify your email and we will only message you when funding changes are worth acting on.
			</p>
			{result?.status === "verification_sent" ? (
				<div className="mt-4 rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--foreground)]">
					Check your inbox for a verification link.
					{result.verificationUrl ? (
						<span className="block pt-2 text-[var(--accent)]">
							Dev preview:{" "}
							<a className="font-medium underline" href={result.verificationUrl}>
								open verification link
							</a>
						</span>
					) : null}
				</div>
			) : null}
			{result?.status === "already_verified" ? (
				<div className="mt-4 rounded-[var(--radius-box)] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--foreground)]">
					This email is already verified and subscribed to funding updates.
				</div>
			) : null}
			{result?.error ? (
				<div className="mt-4 rounded-[var(--radius-box)] border border-[var(--danger-border)] bg-[var(--danger-surface)] px-4 py-3 text-sm text-[var(--foreground)]">
					{result.error}
				</div>
			) : null}
		</div>
	);
}
