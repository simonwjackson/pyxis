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
		<div className="flex-1 p-4 space-y-4">
			<h2 className="text-lg font-semibold">History</h2>

			{entries.length === 0 && offset === 0 && (
				<div className="text-center py-12 text-[var(--color-text-dim)]">
					<History className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-dim)]" />
					<p>No listening history yet.</p>
					<p className="text-sm mt-1">
						Songs you listen to for 30+ seconds will appear here.
					</p>
				</div>
			)}

			{entries.length > 0 && (
				<ul className="space-y-1">
					{entries.map((entry) => (
						<li
							key={entry.id}
							className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-bg-highlight)]"
						>
							<div className="flex-1 min-w-0">
								<p className="text-[var(--color-text)] truncate">
									{entry.title}
								</p>
								<p className="text-xs text-[var(--color-text-dim)]">
									{entry.artist}
									{entry.album ? ` \u2014 ${entry.album}` : ""}
								</p>
							</div>
							<div className="flex items-center gap-2 shrink-0">
								<span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-bg-highlight)] text-[var(--color-text-muted)]">
									{entry.source}
								</span>
								<span className="text-xs text-[var(--color-text-dim)]">
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
