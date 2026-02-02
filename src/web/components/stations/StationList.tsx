import { useState } from "react";
import { Radio, Shuffle, MoreVertical } from "lucide-react";
import { cn } from "../../lib/utils";
import { StationContextMenu } from "./StationContextMenu";

export type RadioStation = {
	readonly id: string;
	readonly stationId: string;
	readonly name: string;
	readonly isQuickMix: boolean;
	readonly allowDelete?: boolean;
	readonly allowRename?: boolean;
	readonly quickMixStationIds?: readonly string[];
};

type StationListProps = {
	readonly stations: readonly RadioStation[];
	readonly currentStationId?: string | undefined;
	readonly onSelect: (station: RadioStation) => void;
	readonly onDetails: (station: RadioStation) => void;
	readonly onRename: (station: RadioStation) => void;
	readonly onDelete: (station: RadioStation) => void;
};

export function StationList({
	stations,
	currentStationId,
	onSelect,
	onDetails,
	onRename,
	onDelete,
}: StationListProps) {
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);

	if (stations.length === 0) {
		return (
			<p className="text-[var(--color-text-dim)] text-sm py-4 text-center">
				No stations found.
			</p>
		);
	}

	return (
		<ul className="space-y-1">
			{stations.map((station) => {
				const isActive = station.id === currentStationId;
				const isMenuOpen = openMenuId === station.id;
				return (
					<li key={station.stationId}>
						<div
							className={cn(
								"flex items-center gap-3 p-3 rounded-lg transition-colors group",
								isActive
									? "bg-[var(--color-bg-highlight)] border border-[var(--color-border-active)]"
									: "hover:bg-[var(--color-bg-highlight)]",
							)}
						>
							<button
								onClick={() => onSelect(station)}
								className="flex items-center gap-3 flex-1 min-w-0 text-left"
								type="button"
							>
								<div
									className={cn(
										"w-10 h-10 rounded flex items-center justify-center shrink-0",
										station.isQuickMix
											? "bg-[var(--color-bg-highlight)]"
											: isActive
												? "bg-[var(--color-bg-highlight)]"
												: "bg-[var(--color-bg-highlight)]",
									)}
								>
									{station.isQuickMix ? (
										<Shuffle
											className={cn(
												"w-5 h-5",
												isActive
													? "text-[var(--color-secondary)]"
													: "text-[var(--color-secondary)]",
											)}
										/>
									) : (
										<Radio
											className={cn(
												"w-5 h-5",
												isActive
													? "text-[var(--color-primary)]"
													: "text-[var(--color-text-dim)]",
											)}
										/>
									)}
								</div>
								<div className="flex-1 min-w-0">
									<p
										className={cn(
											"font-medium truncate",
											isActive
												? "text-[var(--color-text)]"
												: "text-[var(--color-text-muted)]",
										)}
									>
										{station.name}
									</p>
									{station.isQuickMix && (
										<p className="text-sm text-[var(--color-secondary)]">
											QuickMix
										</p>
									)}
									{isActive && !station.isQuickMix && (
										<p className="text-sm text-[var(--color-primary)]">
											Now playing
										</p>
									)}
								</div>
							</button>

							<div className="relative">
								<button
									type="button"
									onClick={() =>
										setOpenMenuId(
											isMenuOpen
												? null
												: station.id,
										)
									}
									className="p-1.5 rounded hover:bg-[var(--color-bg-highlight)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity md:opacity-0 max-md:opacity-100"
									aria-label={`Actions for ${station.name}`}
								>
									<MoreVertical className="w-4 h-4 text-[var(--color-text-muted)]" />
								</button>

								{isMenuOpen && (
									<StationContextMenu
										onClose={() =>
											setOpenMenuId(null)
										}
									>
										<StationContextMenu.Details
											onClick={() => {
												setOpenMenuId(null);
												onDetails(station);
											}}
										/>
										{station.allowRename && (
											<StationContextMenu.Rename
												onClick={() => {
													setOpenMenuId(null);
													onRename(station);
												}}
											/>
										)}
										{station.allowDelete && (
											<StationContextMenu.Delete
												onClick={() => {
													setOpenMenuId(null);
													onDelete(station);
												}}
											/>
										)}
									</StationContextMenu>
								)}
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
