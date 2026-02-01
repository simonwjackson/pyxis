import { LogOut } from "lucide-react";
import { toast } from "sonner";
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
		onSuccess: () => {
			utils.user.settings.invalidate();
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
				<section className="space-y-4">
					<h3 className="text-sm font-medium text-[var(--color-text-muted)]">
						Account
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
						Usage
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
