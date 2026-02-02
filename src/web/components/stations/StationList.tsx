import { useState } from "react";
import { Radio, Shuffle, MoreVertical } from "lucide-react";
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

type StationItemProps = {
	readonly station: RadioStation;
	readonly isActive: boolean;
	readonly isMenuOpen: boolean;
	readonly onSelect: () => void;
	readonly onToggleMenu: () => void;
	readonly onCloseMenu: () => void;
	readonly onDetails: () => void;
	readonly onRename: () => void;
	readonly onDelete: () => void;
};

function StationItemActions({
	station,
	isMenuOpen,
	onToggleMenu,
	onCloseMenu,
	onDetails,
	onRename,
	onDelete,
}: {
	readonly station: RadioStation;
	readonly isMenuOpen: boolean;
	readonly onToggleMenu: () => void;
	readonly onCloseMenu: () => void;
	readonly onDetails: () => void;
	readonly onRename: () => void;
	readonly onDelete: () => void;
}) {
	return (
		<div className="relative">
			<button
				type="button"
				onClick={onToggleMenu}
				className="p-1.5 rounded hover:bg-[var(--color-bg-highlight)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity md:opacity-0 max-md:opacity-100"
				aria-label={`Actions for ${station.name}`}
			>
				<MoreVertical className="w-4 h-4 text-[var(--color-text-muted)]" />
			</button>

			{isMenuOpen && (
				<StationContextMenu onClose={onCloseMenu}>
					<StationContextMenu.Details onClick={onDetails} />
					{station.allowRename && (
						<StationContextMenu.Rename onClick={onRename} />
					)}
					{station.allowDelete && (
						<StationContextMenu.Delete onClick={onDelete} />
					)}
				</StationContextMenu>
			)}
		</div>
	);
}

function QuickMixStationItem({
	station,
	isActive,
	isMenuOpen,
	onSelect,
	onToggleMenu,
	onCloseMenu,
	onDetails,
	onRename,
	onDelete,
}: StationItemProps) {
	return (
		<div
			data-active={isActive || undefined}
			className="flex items-center gap-3 p-3 rounded-lg transition-colors group hover:bg-[var(--color-bg-highlight)] data-[active]:bg-[var(--color-bg-highlight)] data-[active]:border data-[active]:border-[var(--color-border-active)]"
		>
			<button
				onClick={onSelect}
				className="flex items-center gap-3 flex-1 min-w-0 text-left"
				type="button"
			>
				<div className="w-10 h-10 rounded flex items-center justify-center shrink-0 bg-[var(--color-bg-highlight)]">
					<Shuffle className="w-5 h-5 text-[var(--color-secondary)]" />
				</div>
				<div className="flex-1 min-w-0">
					<p
						data-active={isActive || undefined}
						className="font-medium truncate text-[var(--color-text-muted)] data-[active]:text-[var(--color-text)]"
					>
						{station.name}
					</p>
					<p className="text-sm text-[var(--color-secondary)]">
						QuickMix
					</p>
				</div>
			</button>

			<StationItemActions
				station={station}
				isMenuOpen={isMenuOpen}
				onToggleMenu={onToggleMenu}
				onCloseMenu={onCloseMenu}
				onDetails={onDetails}
				onRename={onRename}
				onDelete={onDelete}
			/>
		</div>
	);
}

function RadioStationItem({
	station,
	isActive,
	isMenuOpen,
	onSelect,
	onToggleMenu,
	onCloseMenu,
	onDetails,
	onRename,
	onDelete,
}: StationItemProps) {
	return (
		<div
			data-active={isActive || undefined}
			className="flex items-center gap-3 p-3 rounded-lg transition-colors group hover:bg-[var(--color-bg-highlight)] data-[active]:bg-[var(--color-bg-highlight)] data-[active]:border data-[active]:border-[var(--color-border-active)]"
		>
			<button
				onClick={onSelect}
				className="flex items-center gap-3 flex-1 min-w-0 text-left"
				type="button"
			>
				<div className="w-10 h-10 rounded flex items-center justify-center shrink-0 bg-[var(--color-bg-highlight)]">
					<Radio
						data-active={isActive || undefined}
						className="w-5 h-5 text-[var(--color-text-dim)] data-[active]:text-[var(--color-primary)]"
					/>
				</div>
				<div className="flex-1 min-w-0">
					<p
						data-active={isActive || undefined}
						className="font-medium truncate text-[var(--color-text-muted)] data-[active]:text-[var(--color-text)]"
					>
						{station.name}
					</p>
					{isActive && (
						<p className="text-sm text-[var(--color-primary)]">
							Now playing
						</p>
					)}
				</div>
			</button>

			<StationItemActions
				station={station}
				isMenuOpen={isMenuOpen}
				onToggleMenu={onToggleMenu}
				onCloseMenu={onCloseMenu}
				onDetails={onDetails}
				onRename={onRename}
				onDelete={onDelete}
			/>
		</div>
	);
}

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
				const closeMenu = () => setOpenMenuId(null);
				const toggleMenu = () =>
					setOpenMenuId(isMenuOpen ? null : station.id);
				const itemProps = {
					station,
					isActive,
					isMenuOpen,
					onSelect: () => onSelect(station),
					onToggleMenu: toggleMenu,
					onCloseMenu: closeMenu,
					onDetails: () => {
						closeMenu();
						onDetails(station);
					},
					onRename: () => {
						closeMenu();
						onRename(station);
					},
					onDelete: () => {
						closeMenu();
						onDelete(station);
					},
				};

				const Item = station.isQuickMix
					? QuickMixStationItem
					: RadioStationItem;

				return (
					<li key={station.stationId}>
						<Item {...itemProps} />
					</li>
				);
			})}
		</ul>
	);
}
