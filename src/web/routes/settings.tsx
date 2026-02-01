import { trpc } from "../lib/trpc";
import { Spinner } from "../components/ui/spinner";
import { Button } from "../components/ui/button";
import { useNavigate } from "@tanstack/react-router";

export function SettingsPage() {
	const navigate = useNavigate();
	const settingsQuery = trpc.user.settings.useQuery();
	const usageQuery = trpc.user.usage.useQuery();
	const utils = trpc.useUtils();

	const setExplicit = trpc.user.setExplicitFilter.useMutation({
		onSuccess: () => utils.user.settings.invalidate(),
	});

	const logoutMutation = trpc.auth.logout.useMutation({
		onSuccess() {
			navigate({ to: "/login" });
		},
	});

	if (settingsQuery.isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner />
			</div>
		);
	}

	const settings = settingsQuery.data;
	const usage = usageQuery.data;

	return (
		<div className="flex-1 p-4 space-y-6">
			<h2 className="text-lg font-semibold">Settings</h2>

			{settings && (
				<section className="space-y-3">
					<h3 className="text-sm font-semibold text-zinc-400 uppercase">
						Account
					</h3>
					{settings.username && (
						<p className="text-zinc-300 text-sm">
							Email: {settings.username}
						</p>
					)}
					<div className="flex items-center justify-between">
						<span className="text-zinc-300 text-sm">
							Explicit content filter
						</span>
						<button
							onClick={() =>
								setExplicit.mutate({
									isExplicitContentFilterEnabled:
										!settings.isExplicitContentFilterEnabled,
								})
							}
							className={`w-12 h-6 rounded-full transition-colors ${
								settings.isExplicitContentFilterEnabled
									? "bg-cyan-600"
									: "bg-zinc-700"
							}`}
							type="button"
						>
							<div
								className={`w-5 h-5 rounded-full bg-white transition-transform ${
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
					<h3 className="text-sm font-semibold text-zinc-400 uppercase">
						Usage
					</h3>
					{usage.accountMonthlyListening !== undefined && (
						<p className="text-zinc-300 text-sm">
							Listening this month:{" "}
							{Math.round(usage.accountMonthlyListening / 3600)}h
						</p>
					)}
					{usage.monthlyCapHours !== undefined && (
						<p className="text-zinc-300 text-sm">
							Monthly cap: {usage.monthlyCapHours}h
						</p>
					)}
				</section>
			)}

			<section>
				<Button
					variant="destructive"
					onClick={() => logoutMutation.mutate()}
					disabled={logoutMutation.isPending}
				>
					Sign Out
				</Button>
			</section>
		</div>
	);
}
