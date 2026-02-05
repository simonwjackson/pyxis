/**
 * @module SettingsPage
 * User settings and account information page.
 * Shows Pandora account settings, explicit content filter, and usage statistics.
 */

import { Settings } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import { Spinner } from "@/web/shared/ui/spinner";

/**
 * Settings page displaying account information and preferences.
 * Shows Pandora-specific settings when authenticated.
 */
export function SettingsPage() {
	const statusQuery = trpc.auth.status.useQuery();
	const hasPandora = statusQuery.data?.hasPandora ?? false;

	const settingsQuery = trpc.auth.settings.useQuery(undefined, {
		retry: false,
		enabled: hasPandora,
	})
	const usageQuery = trpc.auth.usage.useQuery(undefined, {
		retry: false,
		enabled: hasPandora,
	})
	const utils = trpc.useUtils();

	const setExplicit = trpc.auth.setExplicitFilter.useMutation({
		onSuccess: () => {
			utils.auth.settings.invalidate();
			toast.success("Setting updated");
		},
	})

	if (statusQuery.isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner />
			</div>
		)
	}

	const settings = settingsQuery.data;
	const usage = usageQuery.data;

	return (
		<div className="flex-1 p-4 space-y-6">
			<h2 className="text-lg font-semibold">Settings</h2>

			{!hasPandora && (
				<div className="text-center py-12 text-[var(--color-text-dim)]">
					<Settings className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-dim)]" />
					<p>No Pandora account connected.</p>
					<p className="text-sm mt-1">
						Configure credentials in your config file to see account settings.
					</p>
				</div>
			)}

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
							role="switch"
							aria-checked={settings.isExplicitContentFilterEnabled}
							aria-label="Explicit content filter"
						>
							<div
								className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
									settings.isExplicitContentFilterEnabled
										? "translate-x-6"
										: "translate-x-0.5"
								}`}
								aria-hidden="true"
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
		</div>
	)
}

