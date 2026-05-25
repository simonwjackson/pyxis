import {
	ArrowLeft,
	BookmarkPlus,
	ChevronDown,
	Flame,
	Music,
	Play,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	type AlbumPlacement,
	formatPlacementLabel,
	hotBadgeClassName,
	placementBadgeClassName,
} from "@/web/shared/lib/library-placement";
import { formatTime } from "@/web/shared/lib/now-playing-utils";
import { Button } from "@/web/shared/ui/button";
import { EditableText } from "@/web/shared/ui/editable-text";
import type { AlbumDetailContentProps } from "./types";

const PLACEMENTS: readonly AlbumPlacement[] = [
	"discovery",
	"collection",
	"archive",
	"dismissed",
];

function formatTotalDuration(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const mins = Math.floor((totalSeconds % 3600) / 60);
	if (hours > 0) return `${String(hours)} hr ${String(mins)} min`;
	return `${String(mins)} min`;
}

function AlbumDetailHotBadge() {
	return (
		<span
			className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${hotBadgeClassName()}`}
		>
			<Flame className="w-3 h-3" />
			Hot
		</span>
	);
}

type AlbumDetailPlacementMenuProps = {
	readonly currentPlacement?: AlbumPlacement | undefined;
	readonly isSettingPlacement: boolean;
	readonly onSetPlacement: (placement: AlbumPlacement) => void;
};

function AlbumDetailPlacementMenu({
	currentPlacement,
	isSettingPlacement,
	onSetPlacement,
}: AlbumDetailPlacementMenuProps) {
	const [isOpen, setIsOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const nextPlacements = currentPlacement
		? PLACEMENTS.filter((placement) => placement !== currentPlacement)
		: PLACEMENTS;

	useEffect(() => {
		if (!isOpen) return;

		function handlePointerDown(event: PointerEvent) {
			if (!menuRef.current?.contains(event.target as Node)) {
				setIsOpen(false);
			}
		}

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setIsOpen(false);
			}
		}

		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen]);

	return (
		<div ref={menuRef} className="relative inline-flex">
			<button
				type="button"
				onClick={() => setIsOpen((open) => !open)}
				disabled={isSettingPlacement}
				aria-expanded={isOpen}
				aria-haspopup="menu"
				className={
					currentPlacement
						? `inline-flex items-center gap-1.5 px-3 py-1.5 text-xs uppercase tracking-[0.18em] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-active)] ${placementBadgeClassName(currentPlacement)}`
						: "inline-flex items-center gap-1.5 border border-[var(--color-border)] px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-active)]"
				}
			>
				<span>
					{currentPlacement
						? formatPlacementLabel(currentPlacement)
						: "Set category"}
				</span>
				<ChevronDown
					className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
				/>
			</button>
			{isOpen ? (
				<div className="absolute left-0 top-full z-10 mt-2 min-w-44 overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg)] shadow-lg">
					<div className="py-1" role="menu" aria-label="Choose category">
						{nextPlacements.map((placement) => (
							<button
								key={placement}
								type="button"
								role="menuitem"
								onClick={() => {
									onSetPlacement(placement);
									setIsOpen(false);
								}}
								className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-bg-highlight)] hover:text-[var(--color-text)]"
							>
								<span>{formatPlacementLabel(placement)}</span>
							</button>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}

export function AlbumDetailContent({
	album,
	tracks,
	currentTrackId,
	currentPlacement,
	isHot,
	canManagePlacement,
	canEditMetadata,
	isSavingAlbum,
	isSettingPlacement,
	onBack,
	onPlay,
	onPlayTrack,
	onSaveAlbum,
	onSetPlacement,
	onUpdateAlbum,
	onUpdateTrack,
}: AlbumDetailContentProps) {
	const totalDuration = tracks.reduce(
		(sum, track) => sum + (track.duration ?? 0),
		0,
	);
	const trackCount = tracks.length;

	return (
		<div className="flex-1 px-4 sm:px-8 py-10 max-w-3xl mx-auto space-y-8">
			<button
				type="button"
				onClick={onBack}
				className="flex items-center gap-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
				aria-label="Go back"
			>
				<ArrowLeft className="w-4 h-4" aria-hidden="true" />
				Back
			</button>

			<div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-end">
				<div className="w-40 h-40 sm:w-56 sm:h-56 shrink-0 shadow-lg overflow-hidden bg-[var(--color-bg-highlight)]">
					{album.artworkUrl ? (
						<img
							src={album.artworkUrl}
							alt={album.title}
							className="w-full h-full object-cover"
						/>
					) : (
						<div className="w-full h-full flex items-center justify-center">
							<Music className="w-16 h-16 text-[var(--color-text-dim)]" />
						</div>
					)}
				</div>
				<div className="space-y-1 min-w-0 text-center sm:text-left">
					<EditableText
						value={album.title}
						onSave={(title) => onUpdateAlbum?.({ title })}
						disabled={!canEditMetadata}
					>
						<h1 className="zune-heading text-3xl md:text-4xl text-[var(--color-text)]">
							{album.title}
						</h1>
					</EditableText>
					<EditableText
						value={album.artist}
						onSave={(artist) => onUpdateAlbum?.({ artist })}
						disabled={!canEditMetadata}
					>
						<p className="text-lg font-light tracking-tight text-[var(--color-text-muted)]">
							{album.artist}
						</p>
					</EditableText>
					<p className="zune-meta text-[var(--color-text-dim)]">
						{album.year ? `${String(album.year)} · ` : ""}
						{String(trackCount)} track{trackCount !== 1 ? "s" : ""}
						{totalDuration > 0
							? ` · ${formatTotalDuration(totalDuration)}`
							: ""}
					</p>
					{isHot ? (
						<div className="flex gap-1.5 pt-2 flex-wrap justify-center sm:justify-start">
							<AlbumDetailHotBadge />
						</div>
					) : null}
					<div className="flex gap-2 sm:gap-3 pt-4 flex-wrap justify-center sm:justify-start">
						<Button
							onClick={onPlay}
							className="gap-2 bg-[var(--color-primary)] hover:brightness-110 text-[var(--color-bg)]"
						>
							<Play className="w-4 h-4" fill="currentColor" />
							Play
						</Button>
						{!currentPlacement && onSaveAlbum ? (
							<Button
								variant="outline"
								onClick={onSaveAlbum}
								disabled={isSavingAlbum}
								className="gap-2"
							>
								<BookmarkPlus className="w-4 h-4" />
								{isSavingAlbum ? "Adding..." : "Add to Discovery"}
							</Button>
						) : currentPlacement === "dismissed" && onSaveAlbum ? (
							<Button
								variant="outline"
								onClick={onSaveAlbum}
								disabled={isSavingAlbum}
								className="gap-2"
							>
								<BookmarkPlus className="w-4 h-4" />
								{isSavingAlbum ? "Restoring..." : "Move to Discovery"}
							</Button>
						) : null}
					</div>
					{canManagePlacement && onSetPlacement ? (
						<div className="pt-2 space-y-2">
							<p className="text-xs uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
								category
							</p>
							<div className="flex justify-center sm:justify-start">
								<AlbumDetailPlacementMenu
									currentPlacement={currentPlacement}
									isSettingPlacement={isSettingPlacement}
									onSetPlacement={onSetPlacement}
								/>
							</div>
						</div>
					) : null}
					{currentPlacement === "dismissed" && isHot ? (
						<p className="text-sm text-[var(--color-text-dim)]">
							This album is dismissed but still hot from recent listening.
						</p>
					) : null}
				</div>
			</div>

			{tracks.length > 0 ? (
				<div className="space-y-px">
					{tracks.map((track, index) => {
						const isActive = currentTrackId === track.id;
						return (
							<button
								key={track.id}
								type="button"
								onClick={() => onPlayTrack(index)}
								className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors ${
									isActive
										? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium"
										: "text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-highlight)]"
								}`}
							>
								<span className="w-6 text-right text-sm">
									{String(index + 1)}
								</span>
								<EditableText
									value={track.title}
									onSave={(title) => onUpdateTrack?.(track.id, title)}
									disabled={!canEditMetadata || !onUpdateTrack}
									className="flex-1 min-w-0"
								>
									<span className="text-sm truncate block">{track.title}</span>
								</EditableText>
								{track.duration != null ? (
									<span className="text-xs">{formatTime(track.duration)}</span>
								) : null}
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
