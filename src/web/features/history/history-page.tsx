/**
 * @module HistoryPage
 * Page displaying the user's listen history (played tracks log).
 */

import { useState } from "react";
import { History } from "lucide-react";
import { trpc } from "@/web/shared/lib/trpc";
import { Spinner } from "@/web/shared/ui/spinner";
import { Button } from "@/web/shared/ui/button";

const PAGE_SIZE = 50;

function formatRelativeTime(date: Date): string {
	const now = Date.now();
	const diff = now - date.getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;
	return date.toLocaleDateString();
}

export function HistoryPage() {
	const [offset, setOffset] = useState(0);
	const historyQuery = trpc.listenLog.list.useQuery({
		limit: PAGE_SIZE,
		offset,
	});

	if (historyQuery.isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner />
			</div>
		);
	}

	const entries = historyQuery.data ?? [];

	return (
		<div className="flex-1 px-4 sm:px-8 py-10 space-y-6">
			<h2 className="zune-display zune-page-title text-[var(--color-text)]">history</h2>

			{entries.length === 0 && offset === 0 && (
				<div className="py-16 text-[var(--color-text-dim)]">
					<p className="zune-display text-4xl text-[var(--color-text-dim)]/40 mb-4">no history</p>
					<p className="text-sm">
						songs you listen to for 30+ seconds will appear here.
					</p>
				</div>
			)}

			{entries.length > 0 && (
				<ul className="space-y-1">
					{entries.map((entry) => (
						<li
							key={entry.id}
							className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-3 hover:bg-[var(--color-bg-highlight)]"
						>
							<div className="flex-1 min-w-0">
								<p className="zune-list-title text-[var(--color-text)] truncate">
									{entry.title}
								</p>
								<p className="zune-eyebrow text-[var(--color-text-dim)]">
									{entry.artist}
									{entry.album ? ` \u2014 ${entry.album}` : ""}
								</p>
							</div>
							<div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
								<span className="zune-eyebrow px-1.5 py-0.5 bg-[var(--color-bg-highlight)] text-[var(--color-text-muted)]">
									{entry.source}
								</span>
								<span className="zune-data text-xs text-[var(--color-text-dim)]">
									{formatRelativeTime(new Date(entry.listenedAt))}
								</span>
							</div>
						</li>
					))}
				</ul>
			)}

			<div className="flex items-center justify-between">
				{offset > 0 && (
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
					>
						Previous
					</Button>
				)}
				{entries.length === PAGE_SIZE && (
					<Button
						variant="ghost"
						size="sm"
						className="ml-auto"
						onClick={() => setOffset(offset + PAGE_SIZE)}
					>
						Older
					</Button>
				)}
			</div>
		</div>
	);
}
