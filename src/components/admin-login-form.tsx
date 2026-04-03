"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm() {
	const router = useRouter();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [totpCode, setTotpCode] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSubmitting(true);
		setError(null);

		try {
			const response = await fetch("/api/admin/session", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					username,
					password,
					totpCode,
				}),
			});

			const payload = (await response.json()) as { error?: string };
			if (!response.ok) {
				throw new Error(payload.error ?? "Unable to sign in.");
			}

			router.replace("/admin/debug");
			router.refresh();
		} catch (submitError) {
			setError(submitError instanceof Error ? submitError.message : "Unable to sign in.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form className="space-y-5" onSubmit={handleSubmit}>
			<div className="space-y-2">
				<label className="text-sm font-medium text-stone-700" htmlFor="admin-username">
					Username
				</label>
				<input
					id="admin-username"
					type="text"
					value={username}
					onChange={(event) => setUsername(event.target.value)}
					autoComplete="username"
					required
					className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-teal-600"
				/>
			</div>

			<div className="space-y-2">
				<label className="text-sm font-medium text-stone-700" htmlFor="admin-password">
					Password
				</label>
				<input
					id="admin-password"
					type="password"
					value={password}
					onChange={(event) => setPassword(event.target.value)}
					autoComplete="current-password"
					required
					className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-teal-600"
				/>
			</div>

			<div className="space-y-2">
				<label className="text-sm font-medium text-stone-700" htmlFor="admin-totp">
					Authenticator code
				</label>
				<input
					id="admin-totp"
					type="text"
					inputMode="numeric"
					pattern="[0-9]{6}"
					value={totpCode}
					onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
					autoComplete="one-time-code"
					required
					className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none focus:border-teal-600"
				/>
			</div>

			<button
				type="submit"
				disabled={isSubmitting}
				className="w-full rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-700"
			>
				{isSubmitting ? "Signing in..." : "Open admin console"}
			</button>

			{error ? (
				<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
			) : null}
		</form>
	);
}
