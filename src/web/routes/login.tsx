import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";
import { trpc } from "../lib/trpc";

export function LoginPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const navigate = useNavigate();
	const utils = trpc.useUtils();

	const loginMutation = trpc.auth.login.useMutation({
		async onSuccess(data) {
			document.cookie = `pyxis_session=${data.sessionId}; path=/; SameSite=Lax`;
			await utils.auth.status.invalidate();
			navigate({ to: "/" });
		},
		onError(err) {
			setError(err.message);
		},
	});

	const guestLoginMutation = trpc.auth.guestLogin.useMutation({
		async onSuccess(data) {
			document.cookie = `pyxis_session=${data.sessionId}; path=/; SameSite=Lax`;
			await utils.auth.status.invalidate();
			navigate({ to: "/" });
		},
		onError(err) {
			setError(err.message);
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		loginMutation.mutate({ username: email, password });
	};

	return (
		<div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)] p-4">
			<div className="w-full max-w-sm">
				<div className="text-center mb-8">
					<h1 className="text-3xl font-bold text-[var(--color-primary)] mb-2">
						pyxis
					</h1>
					<p className="text-[var(--color-text-dim)]">
						Your personal music hub
					</p>
				</div>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
							Email
						</label>
						<input
							type="email"
							placeholder="your@email.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="w-full px-4 py-2 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-active)]"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-[var(--color-text-muted)] mb-1">
							Password
						</label>
						<input
							type="password"
							placeholder="********"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							className="w-full px-4 py-2 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-active)]"
						/>
					</div>
					{error && (
						<div className="p-3 rounded-lg text-[var(--color-error)] text-sm" style={{ backgroundColor: "color-mix(in srgb, var(--color-error) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--color-error) 30%, transparent)" }}>
							{error}
						</div>
					)}
					<Button
						type="submit"
						className="w-full"
						disabled={loginMutation.isPending}
					>
						{loginMutation.isPending ? (
							<Spinner className="h-4 w-4" />
						) : (
							"Sign In"
						)}
					</Button>
				</form>
				<div className="relative my-6">
					<div className="absolute inset-0 flex items-center">
						<div className="w-full border-t border-[var(--color-border)]" />
					</div>
					<div className="relative flex justify-center text-xs">
						<span className="bg-[var(--color-bg)] px-2 text-[var(--color-text-dim)]">
							or
						</span>
					</div>
				</div>
				<Button
					type="button"
					variant="outline"
					className="w-full"
					disabled={guestLoginMutation.isPending}
					onClick={() => guestLoginMutation.mutate()}
				>
					{guestLoginMutation.isPending ? (
						<Spinner className="h-4 w-4" />
					) : (
						"Continue without Pandora"
					)}
				</Button>
				<p className="text-center text-xs text-[var(--color-text-dim)] mt-8">
					This is an unofficial client. Use at your own risk.
				</p>
			</div>
		</div>
	);
}
