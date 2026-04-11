/**
 * @module SearchResults
 * Components for displaying search results: albums, tracks, artists, and genres.
 */

import { Link } from "@tanstack/react-router";
import { User, Music, LayoutGrid, Disc3, Radio, Play, Loader2 } from "lucide-react";
import {
	formatPlacementLabel,
	hotBadgeClassName,
	placementBadgeClassName,
	type AlbumPlacement,
} from "@/web/shared/lib/library-placement";

export type SearchArtist = {
	readonly musicToken: string;
	readonly artistName: string;
};

export type SearchSong = {
	readonly musicToken: string;
	readonly songName: string;
	readonly artistName: string;
};

export type SearchGenreStation = {
	readonly musicToken: string;
	readonly stationName: string;
};

export type SearchTrack = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly album?: string;
	readonly artworkUrl?: string | null;
	readonly capabilities: { readonly radio: boolean };
};

export type SearchAlbumState = {
	readonly albumId: string;
	readonly placement: AlbumPlacement;
	readonly isHot: boolean;
};

export type SearchAlbum = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly year?: number | null;
	readonly artworkUrl?: string | null;
	readonly sourceIds: readonly string[];
	readonly genres?: readonly string[];
	readonly releaseType?: string;
	readonly state?: SearchAlbumState;
};

function SectionHeader({ children }: { readonly children: string }) {
	return <h3 className="zune-label text-[var(--color-text-dim)] mb-3">{children}</h3>;
}

function StateBadge({ placement }: { readonly placement: AlbumPlacement }) {
	return (
		<span className={`text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${placementBadgeClassName(placement)}`}>
			{formatPlacementLabel(placement)}
		</span>
	);
}

function HotBadge() {
	return (
		<span className={`text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${hotBadgeClassName()}`}>
			Hot
		</span>
	);
}

function Empty() {
	return <p className="text-[var(--color-text-dim)] text-sm">No results found.</p>;
}

function Albums({
	albums,
	onPlayAlbum,
	playingAlbumId,
	onSaveAlbum,
}: {
	readonly albums: readonly SearchAlbum[];
	readonly onPlayAlbum?: (albumId: string) => void;
	readonly playingAlbumId?: string | null;
	readonly onSaveAlbum?: (albumId: string) => void;
}) {
	if (albums.length === 0) return null;

	return (
		<section>
			<SectionHeader>albums</SectionHeader>
			<div className="space-y-1">
				{albums.map((album) => {
					const isLoadingPlay = playingAlbumId === album.id;
					const state = album.state;
					const canAdd = !state || state.placement === "dismissed";
					const actionLabel = state?.placement === "dismissed" ? "Re-add to Discovery" : "Add to Discovery";
					return (
						<div
							key={album.id}
							className="flex flex-wrap sm:flex-nowrap items-center gap-4 p-4 hover:bg-[var(--color-bg-highlight)] group"
						>
							<button
								type="button"
								onClick={() => onPlayAlbum?.(album.id)}
								disabled={isLoadingPlay}
								className="relative w-12 h-12 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 overflow-hidden cursor-pointer"
								aria-label={`Play ${album.title}`}
							>
								{album.artworkUrl ? (
									<img src={album.artworkUrl} alt={album.title} className="w-full h-full object-cover" />
								) : (
									<Disc3 className="w-6 h-6 text-[var(--color-text-dim)]" />
								)}
								<div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
									{isLoadingPlay ? (
										<Loader2 className="w-5 h-5 text-[var(--color-primary)] animate-spin" />
									) : (
										<Play
											className="w-5 h-5 text-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
											fill="currentColor"
										/>
									)}
								</div>
							</button>
							<div className="flex-1 min-w-0">
								<Link
									to="/album/$albumId"
									params={{ albumId: album.id }}
									search={{ play: undefined, startIndex: undefined, shuffle: undefined }}
									className="zune-list-title text-[var(--color-text)] truncate block hover:underline"
								>
									{album.title}
								</Link>
								<div className="flex items-center gap-1.5 flex-wrap">
									<span className="zune-eyebrow text-[var(--color-text-dim)]">{album.artist}</span>
									{album.year && (
										<>
											<span className="text-xs text-[var(--color-text-muted)]">&middot;</span>
											<span className="zune-eyebrow text-[var(--color-text-dim)]">{String(album.year)}</span>
										</>
									)}
									{album.releaseType && album.releaseType !== "album" && (
										<>
											<span className="text-xs text-[var(--color-text-muted)]">&middot;</span>
											<span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-bg-highlight)] px-1.5 py-0.5">
												{album.releaseType}
											</span>
										</>
									)}
								</div>
								<div className="flex items-center gap-1 mt-1 flex-wrap">
									{state ? <StateBadge placement={state.placement} /> : null}
									{state?.isHot ? <HotBadge /> : null}
								</div>
								{album.genres && album.genres.length > 0 && (
									<div className="flex gap-1 mt-2 flex-wrap">
										{album.genres.slice(0, 5).map((genre) => (
											<span
												key={genre}
												className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg-highlight)]/80 px-1.5 py-0.5"
											>
												{genre}
											</span>
										))}
									</div>
								)}
							</div>
							{onSaveAlbum ? (
								canAdd ? (
									<button
										type="button"
										onClick={() => onSaveAlbum(album.id)}
										className="text-[10px] sm:text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-bg-highlight)] hover:bg-[var(--color-border)] px-2 sm:px-2.5 py-1 sm:py-1.5 transition-colors shrink-0 w-full sm:w-auto mt-1 sm:mt-0 ml-0 sm:ml-auto"
									>
										{actionLabel}
									</button>
								) : (
									<span className="text-[10px] sm:text-xs text-[var(--color-text-dim)] shrink-0 w-full sm:w-auto mt-1 sm:mt-0 text-left sm:text-right">
										In {formatPlacementLabel(state.placement)}
									</span>
								)
							) : null}
						</div>
					);
				})}
			</div>
		</section>
	);
}

function Tracks({
	tracks,
	onStartRadio,
}: {
	readonly tracks: readonly SearchTrack[];
	readonly onStartRadio?: (track: SearchTrack) => void;
}) {
	if (tracks.length === 0) return null;

	return (
		<section>
			<SectionHeader>songs</SectionHeader>
			<ul className="space-y-1">
				{tracks.map((track) => (
					<li
						key={track.id}
						className="flex items-center gap-4 p-4 hover:bg-[var(--color-bg-highlight)]"
					>
						<div className="w-10 h-10 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 overflow-hidden">
							{track.artworkUrl ? (
								<img src={track.artworkUrl} alt={track.title} className="w-full h-full object-cover" />
							) : (
								<Music className="w-5 h-5 text-[var(--color-text-muted)]" />
							)}
						</div>
						<div className="flex-1 min-w-0">
							<p className="zune-list-title text-[var(--color-text)] truncate">{track.title}</p>
							<p className="zune-eyebrow text-[var(--color-text-dim)]">{track.artist}</p>
						</div>
						<div className="flex items-center gap-1.5 shrink-0">
							{track.capabilities.radio && onStartRadio && (
								<button
									type="button"
									onClick={() => onStartRadio(track)}
									className="text-[10px] sm:text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-bg-highlight)] hover:bg-[var(--color-border)] px-2 sm:px-2.5 py-1 sm:py-1.5 transition-colors flex items-center gap-1"
								>
									<Radio className="w-3 h-3" />
									Start Radio
								</button>
							)}
						</div>
					</li>
				))}
			</ul>
		</section>
	);
}

function Artists({
	artists,
	onCreateStation,
}: {
	readonly artists: readonly SearchArtist[];
	readonly onCreateStation: (musicToken: string) => void;
}) {
	if (artists.length === 0) return null;

	return (
		<section>
			<SectionHeader>artists</SectionHeader>
			<ul className="space-y-1">
				{artists.map((artist) => (
					<li key={artist.musicToken}>
						<button
							onClick={() => onCreateStation(artist.musicToken)}
							className="w-full flex items-center gap-3 p-3 hover:bg-[var(--color-bg-highlight)] text-left"
							type="button"
						>
							<div className="w-10 h-10 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
								<User className="w-5 h-5 text-[var(--color-text-muted)]" />
							</div>
							<div className="flex-1">
								<p className="zune-list-title text-[var(--color-text)]">{artist.artistName}</p>
								<p className="zune-eyebrow text-[var(--color-text-dim)]">pandora</p>
							</div>
							<span className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-primary)] transition-colors">
								+ station
							</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

function Songs({
	songs,
	onCreateStation,
}: {
	readonly songs: readonly SearchSong[];
	readonly onCreateStation: (musicToken: string) => void;
}) {
	if (songs.length === 0) return null;

	return (
		<section>
			<SectionHeader>songs</SectionHeader>
			<ul className="space-y-1">
				{songs.map((song) => (
					<li key={song.musicToken}>
						<button
							onClick={() => onCreateStation(song.musicToken)}
							className="w-full flex items-center gap-3 p-3 hover:bg-[var(--color-bg-highlight)] text-left"
							type="button"
						>
							<div className="w-10 h-10 bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
								<Music className="w-5 h-5 text-[var(--color-text-muted)]" />
							</div>
							<div className="flex-1">
								<p className="zune-list-title text-[var(--color-text)]">{song.songName}</p>
								<p className="text-sm text-[var(--color-text-muted)]">{song.artistName} · pandora</p>
							</div>
							<span className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-primary)] transition-colors">
								+ station
							</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

function Genres({
	genres,
	onCreateStation,
}: {
	readonly genres: readonly SearchGenreStation[];
	readonly onCreateStation: (musicToken: string) => void;
}) {
	if (genres.length === 0) return null;

	return (
		<section>
			<SectionHeader>genres</SectionHeader>
			<ul className="space-y-1">
				{genres.map((genre) => (
					<li key={genre.musicToken}>
						<button
							onClick={() => onCreateStation(genre.musicToken)}
							className="w-full flex items-center gap-3 p-3 hover:bg-[var(--color-bg-highlight)] text-left"
							type="button"
						>
							<div className="w-10 h-10 bg-[var(--color-bg-elevated)] flex items-center justify-center shrink-0">
								<LayoutGrid className="w-5 h-5 text-[var(--color-primary)]" />
							</div>
							<div className="flex-1">
								<p className="zune-list-title text-[var(--color-text)]">{genre.stationName}</p>
							</div>
							<span className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-primary)] transition-colors">
								+ station
							</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

function Root({ children }: { readonly children: React.ReactNode }) {
	return <div className="space-y-10">{children}</div>;
}

export const SearchResults = {
	Root,
	Empty,
	Albums,
	Tracks,
	Artists,
	Songs,
	Genres,
};
