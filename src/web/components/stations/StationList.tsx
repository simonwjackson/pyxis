import { type ReactNode, useState } from "react";
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

type StationItemActionsProps = {
	readonly stationName: string;
	readonly children: ReactNode;
};

function StationItemActions({
	stationName,
	children,
}: StationItemActionsProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				className="p-1.5 rounded hover:bg-[var(--color-bg-highlight)] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity md:opacity-0 max-md:opacity-100"
				aria-label={`Actions for ${stationName}`}
			>
				<MoreVertical className="w-4 h-4 text-[var(--color-text-muted)]" />
			</button>

			{isOpen && (
				<StationContextMenu onClose={() => setIsOpen(false)}>
					{children}
				</StationContextMenu>
			)}
		</div>
	);
}

type StationItemProps = {
	readonly station: RadioStation;
	readonly isActive: boolean;
	readonly onSelect: () => void;
	readonly onDetails: () => void;
	readonly onRename: () => void;
	readonly onDelete: () => void;
};

function QuickMixStationItem({
	station,
	isActive,
	onSelect,
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

			<StationItemActions stationName={station.name}>
				<StationContextMenu.Details onClick={onDetails} />
				{station.allowRename && (
					<StationContextMenu.Rename onClick={onRename} />
				)}
				{station.allowDelete && (
					<StationContextMenu.Delete onClick={onDelete} />
				)}
			</StationItemActions>
		</div>
	);
}

function RadioStationItem({
	station,
	isActive,
	onSelect,
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

			<StationItemActions stationName={station.name}>
				<StationContextMenu.Details onClick={onDetails} />
				{station.allowRename && (
					<StationContextMenu.Rename onClick={onRename} />
				)}
				{station.allowDelete && (
					<StationContextMenu.Delete onClick={onDelete} />
				)}
			</StationItemActions>
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
				const itemProps = {
					station,
					isActive,
					onSelect: () => onSelect(station),
					onDetails: () => onDetails(station),
					onRename: () => onRename(station),
					onDelete: () => onDelete(station),
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
