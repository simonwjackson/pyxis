/**
 * @module SearchResults
 * Components for displaying search results: albums, tracks, artists, and genres.
 */

import { User, Music, LayoutGrid, Disc3, Radio } from "lucide-react";

/**
 * Pandora artist search result.
 */
export type SearchArtist = {
	readonly musicToken: string;
	readonly artistName: string;
};

/**
 * Pandora song search result.
 */
export type SearchSong = {
	readonly musicToken: string;
	readonly songName: string;
	readonly artistName: string;
};

/**
 * Pandora genre station search result.
 */
export type SearchGenreStation = {
	readonly musicToken: string;
	readonly stationName: string;
};

/**
 * Unified track search result from any source.
 */
export type SearchTrack = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly album?: string;
	readonly artworkUrl?: string | null;
	readonly capabilities: { readonly radio: boolean };
};

/**
 * Unified album search result from any source.
 */
export type SearchAlbum = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly year?: number | null;
	readonly artworkUrl?: string | null;
	readonly sourceIds: readonly string[];
	readonly genres?: readonly string[];
	readonly releaseType?: string;
};

function SectionHeader({ children }: { readonly children: string }) {
	return (
		<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
			{children}
		</h3>
	);
}

function Empty() {
	return (
		<p className="text-[var(--color-text-dim)] text-sm">
			No results found.
		</p>
	);
}

function Albums({
	albums,
	onSaveAlbum,
}: {
	readonly albums: readonly SearchAlbum[];
	readonly onSaveAlbum?: (albumId: string) => void;
}) {
	if (albums.length === 0) return null;

	return (
		<section>
			<SectionHeader>Albums</SectionHeader>
			<div className="space-y-1">
				{albums.map((album) => (
					<div
						key={album.id}
						className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-bg-highlight)] group"
					>
						<div className="w-12 h-12 rounded bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 overflow-hidden">
							{album.artworkUrl ? (
								<img
									src={album.artworkUrl}
									alt={album.title}
									className="w-full h-full object-cover"
								/>
							) : (
								<Disc3 className="w-6 h-6 text-[var(--color-text-dim)]" />
							)}
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium text-[var(--color-text)] truncate">
								{album.title}
							</p>
							<div className="flex items-center gap-1.5 flex-wrap">
								<span className="text-xs text-[var(--color-text-dim)]">
									{album.artist}
								</span>
								{album.year && (
									<>
										<span className="text-xs text-[var(--color-text-muted)]">&middot;</span>
										<span className="text-xs text-[var(--color-text-dim)]">
											{String(album.year)}
										</span>
									</>
								)}
								{album.releaseType && album.releaseType !== "album" && (
									<>
										<span className="text-xs text-[var(--color-text-muted)]">&middot;</span>
										<span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-bg-highlight)] px-1.5 py-0.5 rounded">
											{album.releaseType}
										</span>
									</>
								)}
							</div>
							{album.genres && album.genres.length > 0 && (
								<div className="flex gap-1 mt-1 flex-wrap">
									{album.genres.slice(0, 5).map((genre) => (
										<span
											key={genre}
											className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-bg-highlight)]/80 px-1.5 py-0.5 rounded"
										>
											{genre}
										</span>
									))}
								</div>
							)}
						</div>
						{onSaveAlbum && (
							<button
								type="button"
								onClick={() =>
									onSaveAlbum(album.id)
								}
								className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-bg-highlight)] hover:bg-[var(--color-border)] px-2.5 py-1.5 rounded transition-colors shrink-0"
							>
								Save
							</button>
						)}
					</div>
				))}
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
			<SectionHeader>Songs</SectionHeader>
			<ul className="space-y-1">
				{tracks.map((track) => (
					<li
						key={track.id}
						className="flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-bg-highlight)]"
					>
						<div className="w-10 h-10 rounded bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0 overflow-hidden">
							{track.artworkUrl ? (
								<img
									src={track.artworkUrl}
									alt={track.title}
									className="w-full h-full object-cover"
								/>
							) : (
								<Music className="w-5 h-5 text-[var(--color-text-muted)]" />
							)}
						</div>
						<div className="flex-1 min-w-0">
							<p className="text-sm font-medium text-[var(--color-text)] truncate">
								{track.title}
							</p>
							<p className="text-xs text-[var(--color-text-dim)]">
								{track.artist}
							</p>
						</div>
						<div className="flex items-center gap-1.5 shrink-0">
							{track.capabilities.radio && onStartRadio && (
								<button
									type="button"
									onClick={() =>
										onStartRadio(track)
									}
									className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-bg-highlight)] hover:bg-[var(--color-border)] px-2.5 py-1.5 rounded transition-colors flex items-center gap-1"
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
			<SectionHeader>Artists</SectionHeader>
			<ul className="space-y-1">
				{artists.map((artist) => (
					<li key={artist.musicToken}>
						<button
							onClick={() =>
								onCreateStation(artist.musicToken)
							}
							className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-bg-highlight)] text-left"
							type="button"
						>
							<div className="w-10 h-10 rounded-full bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
								<User className="w-5 h-5 text-[var(--color-text-muted)]" />
							</div>
							<div className="flex-1">
								<p className="font-medium text-[var(--color-text)]">
									{artist.artistName}
								</p>
								<p className="text-xs text-[var(--color-text-dim)]">
									Pandora
								</p>
							</div>
							<span className="text-xs text-[var(--color-text-dim)] bg-[var(--color-bg-highlight)] px-2 py-1 rounded">
								Create station
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
			<SectionHeader>Songs</SectionHeader>
			<ul className="space-y-1">
				{songs.map((song) => (
					<li key={song.musicToken}>
						<button
							onClick={() =>
								onCreateStation(song.musicToken)
							}
							className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-bg-highlight)] text-left"
							type="button"
						>
							<div className="w-10 h-10 rounded bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
								<Music className="w-5 h-5 text-[var(--color-text-muted)]" />
							</div>
							<div className="flex-1">
								<p className="font-medium text-[var(--color-text)]">
									{song.songName}
								</p>
								<p className="text-sm text-[var(--color-text-muted)]">
									{song.artistName} · Pandora
								</p>
							</div>
							<span className="text-xs text-[var(--color-text-dim)] bg-[var(--color-bg-highlight)] px-2 py-1 rounded">
								Create station
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
			<SectionHeader>Genres</SectionHeader>
			<ul className="space-y-1">
				{genres.map((genre) => (
					<li key={genre.musicToken}>
						<button
							onClick={() =>
								onCreateStation(genre.musicToken)
							}
							className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[var(--color-bg-highlight)] text-left"
							type="button"
						>
							<div className="w-10 h-10 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
								<LayoutGrid className="w-5 h-5 text-white" />
							</div>
							<div className="flex-1">
								<p className="font-medium text-[var(--color-text)]">
									{genre.stationName}
								</p>
							</div>
							<span className="text-xs text-[var(--color-text-dim)] bg-[var(--color-bg-highlight)] px-2 py-1 rounded">
								Create station
							</span>
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}

function Root({ children }: { readonly children: React.ReactNode }) {
	return <div className="space-y-6">{children}</div>;
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
