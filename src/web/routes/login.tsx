import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";
import { trpc } from "../lib/trpc";

export function LoginPage() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const navigate = useNavigate();

	const loginMutation = trpc.auth.login.useMutation({
		onSuccess() {
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
				<h1 className="text-3xl font-bold text-cyan-400 mb-2 text-center">
					pyxis
				</h1>
				<p className="text-zinc-500 text-center mb-8">
					Sign in to your Pandora account
				</p>
				<form onSubmit={handleSubmit} className="space-y-4">
					<Input
						type="email"
						placeholder="Email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						required
					/>
					<Input
						type="password"
						placeholder="Password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						required
					/>
					{error && (
						<p className="text-red-400 text-sm">{error}</p>
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
			</div>
		</div>
	);
}
