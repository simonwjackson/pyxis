import { User, Music, LayoutGrid, Disc3, Radio } from "lucide-react";
import type {
	SearchArtist,
	SearchSong,
	SearchGenreStation,
} from "../../../types/api";
import type { CanonicalTrack, CanonicalAlbum } from "../../../sources/types";

type SearchResultsProps = {
	readonly artists?: readonly SearchArtist[];
	readonly songs?: readonly SearchSong[];
	readonly genreStations?: readonly SearchGenreStation[];
	readonly tracks?: readonly CanonicalTrack[];
	readonly albums?: readonly CanonicalAlbum[];
	readonly onCreateStation: (musicToken: string) => void;
	readonly onSaveAlbum?: (album: CanonicalAlbum) => void;
	readonly onStartRadio?: (track: CanonicalTrack) => void;
};

export function SearchResults({
	artists,
	songs,
	genreStations,
	tracks,
	albums,
	onCreateStation,
	onSaveAlbum,
	onStartRadio,
}: SearchResultsProps) {
	const hasResults =
		(artists && artists.length > 0) ||
		(songs && songs.length > 0) ||
		(genreStations && genreStations.length > 0) ||
		(tracks && tracks.length > 0) ||
		(albums && albums.length > 0);

	if (!hasResults) {
		return (
			<p className="text-[var(--color-text-dim)] text-sm">
				No results found.
			</p>
		);
	}

	return (
		<div className="space-y-6">
			{/* Albums section */}
			{albums && albums.length > 0 && (
				<section>
					<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
						Albums
					</h3>
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
									<p className="text-xs text-[var(--color-text-dim)]">
										{album.artist}
										{album.year
											? ` \u00B7 ${String(album.year)}`
											: ""}
										{` \u00B7 ${album.sourceIds[0]?.source === "ytmusic" ? "YouTube Music" : album.sourceIds[0]?.source ?? ""}`}
									</p>
								</div>
								{onSaveAlbum && (
									<button
										type="button"
										onClick={() => onSaveAlbum(album)}
										className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-bg-highlight)] hover:bg-[var(--color-border)] px-2.5 py-1.5 rounded transition-colors shrink-0"
									>
										Save
									</button>
								)}
							</div>
						))}
					</div>
				</section>
			)}

			{/* Unified tracks (from all sources) */}
			{tracks && tracks.length > 0 && (
				<section>
					<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
						Songs
					</h3>
					<ul className="space-y-1">
						{tracks.map((track) => (
							<li
								key={`${track.sourceId.source}-${track.id}`}
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
										{` \u00B7 ${track.sourceId.source === "ytmusic" ? "YouTube Music" : track.sourceId.source === "pandora" ? "Pandora" : track.sourceId.source}`}
									</p>
								</div>
								<div className="flex items-center gap-1.5 shrink-0">
									{track.sourceId.source === "pandora" && (
										<button
											type="button"
											onClick={() =>
												onCreateStation(track.id)
											}
											className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] bg-[var(--color-bg-highlight)] hover:bg-[var(--color-border)] px-2.5 py-1.5 rounded transition-colors"
										>
											Create station
										</button>
									)}
									{track.sourceId.source === "ytmusic" &&
										onStartRadio && (
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
			)}

			{/* Legacy Pandora artists */}
			{artists && artists.length > 0 && (
				<section>
					<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
						Artists
					</h3>
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
			)}

			{/* Legacy Pandora songs (shown only when no unified tracks) */}
			{songs &&
				songs.length > 0 &&
				(!tracks || tracks.length === 0) && (
					<section>
						<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
							Songs
						</h3>
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
				)}

			{genreStations && genreStations.length > 0 && (
				<section>
					<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
						Genres
					</h3>
					<ul className="space-y-1">
						{genreStations.map((genre) => (
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
			)}
		</div>
	);
}
