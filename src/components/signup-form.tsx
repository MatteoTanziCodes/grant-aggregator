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
		<div className="rounded-[1.75rem] border border-stone-200/80 bg-white/95 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur sm:p-6">
			<form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
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
					className="min-w-0 flex-1 rounded-full border border-stone-300 bg-stone-50 px-5 py-3 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-teal-600 focus:bg-white"
				/>
				<button
					type="submit"
					disabled={isSubmitting}
					className="rounded-full bg-teal-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-teal-500"
				>
					{isSubmitting ? "Sending link..." : "Get verification link"}
				</button>
			</form>
			<p className="mt-3 text-sm leading-6 text-stone-600">
				No account, no password. Verify your email and we will only message you when funding changes are worth acting on.
			</p>
			{result?.status === "verification_sent" ? (
				<div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
					Check your inbox for a verification link.
					{result.verificationUrl ? (
						<span className="block pt-2 text-teal-800">
							Dev preview:{" "}
							<a className="font-medium underline" href={result.verificationUrl}>
								open verification link
							</a>
						</span>
					) : null}
				</div>
			) : null}
			{result?.status === "already_verified" ? (
				<div className="mt-4 rounded-2xl border border-stone-200 bg-stone-100 px-4 py-3 text-sm text-stone-800">
					This email is already verified and subscribed to funding updates.
				</div>
			) : null}
			{result?.error ? (
				<div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
					{result.error}
				</div>
			) : null}
		</div>
	);
}
