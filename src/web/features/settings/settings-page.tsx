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
			toast.success("setting updated");
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
		<div className="flex-1 px-8 py-10 space-y-8">
			<h2 className="zune-display zune-page-title text-[var(--color-text)]">settings</h2>

			{!hasPandora && (
				<div className="py-16 text-[var(--color-text-dim)]">
					<p className="zune-display text-4xl text-[var(--color-text-dim)]/40 mb-4">no account</p>
					<p className="text-sm">
						configure credentials in your config file to see account settings.
					</p>
				</div>
			)}

			{settings && (
				<section className="space-y-4">
					<h3 className="zune-label text-[var(--color-text-muted)]">
						pandora account
					</h3>
					{settings.username && (
						<div className="flex items-center justify-between py-2">
							<span className="zune-meta">email</span>
							<span className="zune-copy text-sm text-[var(--color-text-muted)]">
								{settings.username}
							</span>
						</div>
					)}
					<div className="flex items-center justify-between py-2">
						<span className="zune-meta">
							explicit content filter
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
					<h3 className="zune-label text-[var(--color-text-muted)]">
						pandora usage
					</h3>
					{usage.accountMonthlyListening !== undefined && (
						<div className="flex items-center justify-between py-2">
							<span className="zune-copy text-sm text-[var(--color-text-muted)]">
								listening this month
							</span>
							<span className="zune-data text-sm text-[var(--color-text-muted)]">
								{Math.round(
									usage.accountMonthlyListening / 3600,
								)}
								h
							</span>
						</div>
					)}
					{usage.monthlyCapHours !== undefined && (
						<div className="flex items-center justify-between py-2">
							<span className="zune-copy text-sm text-[var(--color-text-muted)]">
								monthly cap
							</span>
							<span className="zune-data text-sm text-[var(--color-text-muted)]">
								{usage.monthlyCapHours}h
							</span>
						</div>
					)}
				</section>
			)}
		</div>
	)
}

