/**
 * @module StationsPage
 * Page for viewing and managing radio stations.
 *
 * Reads `radio.stations.list` through the Effect RPC client and adapts the
 * AsyncResult into the pure {@link StationsState} ADT before rendering.
 * Station mutations (delete/rename/quick-mix) publish the
 * {@link RADIO_STATIONS_TAG} reactivity tag so the list refetches without a
 * React Query bridge.
 */

import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { Search, Shuffle } from "lucide-react";
import { useState } from "react";
import { PyxisRpcClient } from "@/web/shared/api/rpcClient";
import { projectQueryResult } from "@/web/shared/effect/projectQueryResult";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import { StationListSkeleton } from "@/web/shared/ui/skeleton";
import type { ApiStationSummary } from "../../../api/contracts/radio.js";
import { DeleteStationDialog } from "./delete-station-dialog";
import { QuickMixDialog } from "./quick-mix-dialog";
import { RADIO_STATIONS_TAG } from "./radioReactivityTags";
import { RenameStationDialog } from "./rename-station-dialog";
import { StationsState } from "./StationsState";
import { StationList } from "./station-list";
import type { RadioStation } from "./station-list/types";

const stationsReactivityKeys = [RADIO_STATIONS_TAG] as const;

const stationsQueryAtom = PyxisRpcClient.query(
	"radio.stations.list",
	undefined,
	{
		reactivityKeys: stationsReactivityKeys,
	},
);

/**
 * Dialog state for station management modals. Widget-local UI state owned
 * by the page; not part of the {@link StationsState} contract.
 */
type DialogState =
	| { readonly type: "none" }
	| { readonly type: "delete"; readonly station: RadioStation }
	| { readonly type: "rename"; readonly station: RadioStation }
	| { readonly type: "quickmix" };

/**
 * Stations page showing list of radio stations with filter and management
 * options. Allows playing, renaming, deleting stations, and managing
 * QuickMix selection.
 */
export function StationsPage() {
	const [filter, setFilter] = useState("");
	const [dialog, setDialog] = useState<DialogState>({ type: "none" });
	const navigate = useNavigate();
	const result = projectQueryResult(useAtomValue(stationsQueryAtom));
	const state = StationsState.fromResult(result);
	const playback = usePlaybackContext();

	const handleSelect = (station: RadioStation) => {
		navigate({
			to: "/station/$token",
			params: { token: station.id },
			search: { play: "1" },
		});
	};

	const handleDetails = (station: RadioStation) => {
		navigate({
			to: "/station/$token",
			params: { token: station.id },
			search: { play: undefined },
		});
	};

	if (state._tag === "Loading") {
		return <StationListSkeleton />;
	}

	if (state._tag === "LoadError" || state._tag === "Defect") {
		return (
			<div className="flex-1 px-4 sm:px-8 py-10">
				<p className="text-[var(--color-error)]">failed to load stations</p>
			</div>
		);
	}

	const allStations: readonly ApiStationSummary[] =
		state._tag === "Ready" ? state.stations : [];
	const hasQuickMix = allStations.some((s) => s.isQuickMix);
	const filteredStations = allStations.filter((s) =>
		s.name.toLowerCase().includes(filter.toLowerCase()),
	);

	return (
		<div className="flex-1 px-4 sm:px-8 py-10 space-y-6">
			<div className="flex items-center justify-between">
				<h2 className="zune-display zune-page-title text-[var(--color-text)]">
					your stations
				</h2>
				{hasQuickMix && (
					<button
						type="button"
						onClick={() => setDialog({ type: "quickmix" })}
						className="flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--color-secondary)] hover:bg-[var(--color-bg-highlight)] transition-colors"
					>
						<Shuffle className="w-4 h-4" />
						manage shuffle
					</button>
				)}
			</div>
			<div className="relative">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-dim)]" />
				<input
					type="text"
					placeholder="filter stations..."
					value={filter}
					onChange={(e) => setFilter(e.target.value)}
					aria-label="Filter stations"
					className="w-full pl-10 pr-4 py-2 bg-[var(--color-bg-highlight)] border border-[var(--color-border)] text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-active)]"
				/>
			</div>
			<StationList
				stations={filteredStations}
				currentStationId={playback.currentStationToken ?? undefined}
				onSelect={handleSelect}
				onDetails={handleDetails}
				onRename={(station) => setDialog({ type: "rename", station })}
				onDelete={(station) => setDialog({ type: "delete", station })}
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
