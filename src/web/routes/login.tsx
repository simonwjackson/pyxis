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
		onSuccess(data) {
			// Set session cookie for subsequent requests
			document.cookie = `pyxis_session=${data.sessionId}; path=/; SameSite=Lax`;
			utils.auth.status.invalidate();
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
		<div className="min-h-screen flex items-center justify-center bg-zinc-900 p-4">
			<div className="w-full max-w-sm">
				<div className="text-center mb-8">
					<h1 className="text-3xl font-bold text-cyan-400 mb-2">
						pyxis
					</h1>
					<p className="text-zinc-500">
						Pandora client for the modern web
					</p>
				</div>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-zinc-400 mb-1">
							Email
						</label>
						<input
							type="email"
							placeholder="your@email.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-zinc-400 mb-1">
							Password
						</label>
						<input
							type="password"
							placeholder="********"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
						/>
					</div>
					{error && (
						<div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
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
				<p className="text-center text-xs text-zinc-600 mt-8">
					This is an unofficial client. Use at your own risk.
				</p>
			</div>
		</div>
	);
}
