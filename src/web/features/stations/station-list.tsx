import { type ReactNode, useState } from "react";
import { Radio, Shuffle, MoreVertical } from "lucide-react";
import { StationContextMenu } from "./station-context-menu";

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

function StationItemActions({
	stationName,
	children,
}: {
	readonly stationName: string;
	readonly children: ReactNode;
}) {
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

function StationItemRoot({
	isActive,
	onSelect,
	icon,
	info,
	actions,
}: {
	readonly isActive: boolean;
	readonly onSelect: () => void;
	readonly icon: ReactNode;
	readonly info: ReactNode;
	readonly actions: ReactNode;
}) {
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
					{icon}
				</div>
				<div className="flex-1 min-w-0">{info}</div>
			</button>
			{actions}
		</div>
	);
}

function StationItemName({
	isActive,
	children,
}: {
	readonly isActive: boolean;
	readonly children: ReactNode;
}) {
	return (
		<p
			data-active={isActive || undefined}
			className="font-medium truncate text-[var(--color-text-muted)] data-[active]:text-[var(--color-text)]"
		>
			{children}
		</p>
	);
}

function StationItemSubtitle({
	children,
	className,
}: {
	readonly children: ReactNode;
	readonly className?: string;
}) {
	return <p className={`text-sm ${className ?? ""}`}>{children}</p>;
}

const StationItem = {
	Root: StationItemRoot,
	Name: StationItemName,
	Subtitle: StationItemSubtitle,
	Actions: StationItemActions,
};

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

				return (
					<li key={station.stationId}>
						<StationItem.Root
							isActive={isActive}
							onSelect={() => onSelect(station)}
							icon={
								station.isQuickMix ? (
									<Shuffle className="w-5 h-5 text-[var(--color-secondary)]" />
								) : (
									<Radio
										data-active={isActive || undefined}
										className="w-5 h-5 text-[var(--color-text-dim)] data-[active]:text-[var(--color-primary)]"
									/>
								)
							}
							info={
								<>
									<StationItem.Name isActive={isActive}>
										{station.name}
									</StationItem.Name>
									{station.isQuickMix ? (
										<StationItem.Subtitle className="text-[var(--color-secondary)]">
											QuickMix
										</StationItem.Subtitle>
									) : (
										isActive && (
											<StationItem.Subtitle className="text-[var(--color-primary)]">
												Now playing
											</StationItem.Subtitle>
										)
									)}
								</>
							}
							actions={
								<StationItem.Actions stationName={station.name}>
									<StationContextMenu.Details
										onClick={() => onDetails(station)}
									/>
									{station.allowRename && (
										<StationContextMenu.Rename
											onClick={() => onRename(station)}
										/>
									)}
									{station.allowDelete && (
										<StationContextMenu.Delete
											onClick={() => onDelete(station)}
										/>
									)}
								</StationItem.Actions>
							}
						/>
					</li>
				);
			})}
		</ul>
	);
}
