import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Shuffle } from "lucide-react";
import { trpc } from "../lib/trpc";
import { StationList } from "../components/stations/StationList";
import { DeleteStationDialog } from "../components/stations/DeleteStationDialog";
import { RenameStationDialog } from "../components/stations/RenameStationDialog";
import { QuickMixDialog } from "../components/stations/QuickMixDialog";
import { StationListSkeleton } from "../components/ui/skeleton";
import { usePlaybackContext } from "../contexts/PlaybackContext";
import type { RadioStation } from "../components/stations/StationList";

type DialogState =
	| { readonly type: "none" }
	| { readonly type: "delete"; readonly station: RadioStation }
	| { readonly type: "rename"; readonly station: RadioStation }
	| { readonly type: "quickmix" };

export function StationsPage() {
	const [filter, setFilter] = useState("");
	const [dialog, setDialog] = useState<DialogState>({ type: "none" });
	const navigate = useNavigate();
	const stationsQuery = trpc.radio.list.useQuery();
	const playback = usePlaybackContext();

	const allStations = stationsQuery.data ?? [];
	const hasQuickMix = allStations.some((s: RadioStation) => s.isQuickMix);
	const filteredStations = allStations.filter((s: RadioStation) =>
		s.name.toLowerCase().includes(filter.toLowerCase()),
	);

	const handleSelect = (station: RadioStation) => {
		navigate({
			to: "/now-playing",
			search: { station: station.id },
		});
	};

	const handleDetails = (station: RadioStation) => {
		navigate({
			to: "/station/$token",
			params: { token: station.id },
		});
	};

	if (stationsQuery.isLoading) {
		return <StationListSkeleton />;
	}

	if (stationsQuery.error) {
		return (
			<div className="flex-1 p-4">
				<p className="text-[var(--color-error)]">
					Failed to load stations:{" "}
					{stationsQuery.error.message}
				</p>
			</div>
		);
	}

	return (
		<div className="flex-1 p-4 space-y-4">
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold">Your Stations</h2>
				{hasQuickMix && (
					<button
						type="button"
						onClick={() => setDialog({ type: "quickmix" })}
						className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-secondary)] hover:bg-[var(--color-bg-highlight)] rounded-lg transition-colors"
					>
						<Shuffle className="w-4 h-4" />
						Manage Shuffle
					</button>
				)}
			</div>
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-dim)]" />
				<input
					type="text"
					placeholder="Filter stations..."
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					aria-label="Filter stations"
					className="w-full pl-10 pr-4 py-2 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-active)]"
				/>
			</div>
			<StationList
				stations={filteredStations}
				currentStationId={playback.currentStationToken ?? undefined}
				onSelect={handleSelect}
				onDetails={handleDetails}
				onRename={(station) =>
					setDialog({ type: "rename", station })
				}
				onDelete={(station) =>
					setDialog({ type: "delete", station })
				}
			/>

			{dialog.type === "delete" && (
				<DeleteStationDialog
					stationId={dialog.station.id}
					stationName={dialog.station.name}
					onSuccess={() => setDialog({ type: "none" })}
					onCancel={() => setDialog({ type: "none" })}
				/>
			)}

			{dialog.type === "rename" && (
				<RenameStationDialog
					stationId={dialog.station.id}
					stationName={dialog.station.name}
					onSuccess={() => setDialog({ type: "none" })}
					onCancel={() => setDialog({ type: "none" })}
				/>
			)}

			{dialog.type === "quickmix" && (
				<QuickMixDialog
					stations={allStations}
					onClose={() => setDialog({ type: "none" })}
				/>
			)}
		</div>
	);
}
