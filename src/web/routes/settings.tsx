import { useState } from "react";
import { LogOut, Plus, Trash2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { Spinner } from "../components/ui/spinner";
import { Button } from "../components/ui/button";
import { useNavigate } from "@tanstack/react-router";

function SourceCredentialForm({
	onSuccess,
}: {
	readonly onSuccess: () => void;
}) {
	const [source, setSource] = useState<"pandora" | "ytmusic">("pandora");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");

	const addMutation = trpc.credentials.add.useMutation({
		onSuccess: () => {
			setUsername("");
			setPassword("");
			toast.success("Credentials added");
			onSuccess();
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				addMutation.mutate({ source, username, password });
			}}
			className="space-y-3"
		>
			<div>
				<label className="block text-xs text-[var(--color-text-dim)] mb-1">
					Source
				</label>
				<select
					value={source}
					onChange={(e) =>
						setSource(e.target.value as "pandora" | "ytmusic")
					}
					className="w-full px-3 py-1.5 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)]"
				>
					<option value="pandora">Pandora</option>
					<option value="ytmusic">YouTube Music</option>
				</select>
			</div>
			<div>
				<label className="block text-xs text-[var(--color-text-dim)] mb-1">
					Username / Email
				</label>
				<input
					type="text"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					required
					className="w-full px-3 py-1.5 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]"
					placeholder="user@example.com"
				/>
			</div>
			<div>
				<label className="block text-xs text-[var(--color-text-dim)] mb-1">
					Password
				</label>
				<input
					type="password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					required
					className="w-full px-3 py-1.5 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]"
					placeholder="********"
				/>
			</div>
			<Button
				type="submit"
				disabled={addMutation.isPending}
				className="gap-1.5"
			>
				{addMutation.isPending ? (
					<Spinner className="h-3 w-3" />
				) : (
					<Plus className="w-3 h-3" />
				)}
				Add Credential
			</Button>
		</form>
	);
}

function SourceCredentialsSection() {
	const [showForm, setShowForm] = useState(false);
	const utils = trpc.useUtils();
	const credentialsQuery = trpc.credentials.list.useQuery();

	const removeMutation = trpc.credentials.remove.useMutation({
		onSuccess: () => {
			utils.credentials.list.invalidate();
			toast.success("Credential removed");
		},
	});

	const credentials = credentialsQuery.data ?? [];

	return (
		<section className="space-y-3">
			<h3 className="text-sm font-medium text-[var(--color-text-muted)]">
				Source Credentials
			</h3>

			{credentialsQuery.isLoading ? (
				<Spinner />
			) : credentials.length === 0 ? (
				<p className="text-sm text-[var(--color-text-dim)]">
					No source credentials configured.
				</p>
			) : (
				<div className="space-y-2">
					{credentials.map((cred) => (
						<div
							key={cred.id}
							className="flex items-center justify-between py-2 px-3 rounded bg-[var(--color-bg-highlight)]"
						>
							<div className="flex items-center gap-2">
								{cred.hasSession ? (
									<CheckCircle className="w-4 h-4 text-green-500" />
								) : (
									<XCircle className="w-4 h-4 text-[var(--color-text-dim)]" />
								)}
								<div>
									<span className="text-sm font-medium capitalize">
										{cred.source}
									</span>
									<span className="text-sm text-[var(--color-text-dim)] ml-2">
										{cred.username}
									</span>
								</div>
							</div>
							<button
								type="button"
								onClick={() =>
									removeMutation.mutate({ id: cred.id })
								}
								disabled={removeMutation.isPending}
								className="text-[var(--color-text-dim)] hover:text-[var(--color-error)] transition-colors p-1"
							>
								<Trash2 className="w-4 h-4" />
							</button>
						</div>
					))}
				</div>
			)}

			{showForm ? (
				<div className="mt-3 p-3 rounded border border-[var(--color-border)]">
					<SourceCredentialForm
						onSuccess={() => {
							setShowForm(false);
							utils.credentials.list.invalidate();
						}}
					/>
				</div>
			) : (
				<Button
					variant="outline"
					className="gap-1.5"
					onClick={() => setShowForm(true)}
				>
					<Plus className="w-3 h-3" />
					Add Source
				</Button>
			)}
		</section>
	);
}

export function SettingsPage() {
	const navigate = useNavigate();
	const settingsQuery = trpc.auth.settings.useQuery(undefined, {
		retry: false,
	});
	const usageQuery = trpc.auth.usage.useQuery(undefined, {
		retry: false,
	});
	const utils = trpc.useUtils();

	const setExplicit = trpc.auth.setExplicitFilter.useMutation({
		onSuccess: () => {
			utils.auth.settings.invalidate();
			toast.success("Setting updated");
		},
	});

	const logoutMutation = trpc.auth.logout.useMutation({
		onSuccess() {
			document.cookie =
				"pyxis_session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
			navigate({ to: "/login" });
		},
	});

	const settings = settingsQuery.data;
	const usage = usageQuery.data;

	return (
		<div className="flex-1 p-4 space-y-6">
			<h2 className="text-lg font-semibold">Settings</h2>

			<SourceCredentialsSection />

			{settings && (
				<section className="space-y-4">
					<h3 className="text-sm font-medium text-[var(--color-text-muted)]">
						Pandora Account
					</h3>
					{settings.username && (
						<div className="flex items-center justify-between py-2">
							<span className="text-[var(--color-text-muted)] text-sm">Email</span>
							<span className="text-[var(--color-text-muted)] text-sm">
								{settings.username}
							</span>
						</div>
					)}
					<div className="flex items-center justify-between py-2">
						<span className="text-[var(--color-text-muted)] text-sm">
							Explicit content filter
						</span>
						<button
							onClick={() =>
								setExplicit.mutate({
									enabled:
										!settings.isExplicitContentFilterEnabled,
								})
							}
							className={`w-12 h-6 rounded-full transition-colors relative ${
								settings.isExplicitContentFilterEnabled
									? "bg-[var(--color-primary)]"
									: "bg-[var(--color-bg-highlight)]"
							}`}
							type="button"
						>
							<div
								className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
									settings.isExplicitContentFilterEnabled
										? "translate-x-6"
										: "translate-x-0.5"
								}`}
							/>
						</button>
					</div>
				</section>
			)}

			{usage && (
				<section className="space-y-2">
					<h3 className="text-sm font-medium text-[var(--color-text-muted)]">
						Pandora Usage
					</h3>
					{usage.accountMonthlyListening !== undefined && (
						<div className="flex items-center justify-between py-2">
							<span className="text-[var(--color-text-muted)] text-sm">
								Listening this month
							</span>
							<span className="text-[var(--color-text-muted)] text-sm">
								{Math.round(
									usage.accountMonthlyListening / 3600,
								)}
								h
							</span>
						</div>
					)}
					{usage.monthlyCapHours !== undefined && (
						<div className="flex items-center justify-between py-2">
							<span className="text-[var(--color-text-muted)] text-sm">
								Monthly cap
							</span>
							<span className="text-[var(--color-text-muted)] text-sm">
								{usage.monthlyCapHours}h
							</span>
						</div>
					)}
				</section>
			)}

			<section className="pt-4 border-t border-[var(--color-border)]">
				<Button
					variant="destructive"
					className="gap-2"
					onClick={() => logoutMutation.mutate()}
					disabled={logoutMutation.isPending}
				>
					<LogOut className="w-4 h-4" />
					Sign Out
				</Button>
			</section>
		</div>
	);
}
