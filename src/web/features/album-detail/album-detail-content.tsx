import { ArrowLeft, BookmarkPlus, Flame, Music, Play, Shuffle } from "lucide-react";
import { EditableText } from "@/web/shared/ui/editable-text";
import { Button } from "@/web/shared/ui/button";
import {
	formatPlacementLabel,
	hotBadgeClassName,
	placementBadgeClassName,
	type AlbumPlacement,
} from "@/web/shared/lib/library-placement";
import { formatTime } from "@/web/shared/lib/now-playing-utils";
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

function AlbumDetailPlacementBadge({ placement }: { readonly placement: AlbumPlacement }) {
	return (
		<span
			className={`text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${placementBadgeClassName(placement)}`}
		>
			{formatPlacementLabel(placement)}
		</span>
	);
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
	onShuffle,
	onPlayTrack,
	onSaveAlbum,
	onSetPlacement,
	onUpdateAlbum,
	onUpdateTrack,
}: AlbumDetailContentProps) {
	const totalDuration = tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
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
						<img src={album.artworkUrl} alt={album.title} className="w-full h-full object-cover" />
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
						{totalDuration > 0 ? ` · ${formatTotalDuration(totalDuration)}` : ""}
					</p>
					<div className="flex gap-1.5 pt-2 flex-wrap justify-center sm:justify-start">
						{currentPlacement ? (
							<AlbumDetailPlacementBadge placement={currentPlacement} />
						) : null}
						{isHot ? <AlbumDetailHotBadge /> : null}
					</div>
					<div className="flex gap-2 sm:gap-3 pt-4 flex-wrap justify-center sm:justify-start">
						<Button
							onClick={onPlay}
							className="gap-2 bg-[var(--color-primary)] hover:brightness-110 text-[var(--color-bg)]"
						>
							<Play className="w-4 h-4" fill="currentColor" />
							Play
						</Button>
						<Button variant="outline" onClick={onShuffle} className="gap-2">
							<Shuffle className="w-4 h-4" />
							Shuffle
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
								placement
							</p>
							<div className="flex gap-1.5 sm:gap-2 flex-wrap justify-center sm:justify-start">
								{PLACEMENTS.map((placement) => {
									const active = currentPlacement === placement;
									return (
										<button
											key={placement}
											type="button"
											onClick={() => onSetPlacement(placement)}
											disabled={active || isSettingPlacement}
											className={active
												? `px-3 py-1.5 text-xs uppercase tracking-[0.18em] ${placementBadgeClassName(placement)}`
												: "px-3 py-1.5 text-xs uppercase tracking-[0.18em] border border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"}
										>
											{formatPlacementLabel(placement)}
										</button>
									);
								})}
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
								<span className="w-6 text-right text-sm">{String(index + 1)}</span>
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
