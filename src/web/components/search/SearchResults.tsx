import { User, Music, LayoutGrid } from "lucide-react";
import type {
	SearchArtist,
	SearchSong,
	SearchGenreStation,
} from "../../../types/api";
import { Button } from "../ui/button";

type SearchResultsProps = {
	readonly artists?: readonly SearchArtist[];
	readonly songs?: readonly SearchSong[];
	readonly genreStations?: readonly SearchGenreStation[];
	readonly onCreateStation: (musicToken: string) => void;
};

export function SearchResults({
	artists,
	songs,
	genreStations,
	onCreateStation,
}: SearchResultsProps) {
	const hasResults =
		(artists && artists.length > 0) ||
		(songs && songs.length > 0) ||
		(genreStations && genreStations.length > 0);

	if (!hasResults) {
		return <p className="text-[var(--color-text-dim)] text-sm">No results found.</p>;
	}

	return (
		<div className="space-y-6">
			{artists && artists.length > 0 && (
				<section>
					<h3 className="text-sm font-medium text-[var(--color-text-muted)] mb-2">
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
			{songs && songs.length > 0 && (
				<section>
					<h3 className="text-sm font-medium text-[var(--color-text-muted)] mb-2">
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
											{song.artistName}
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
					<h3 className="text-sm font-medium text-[var(--color-text-muted)] mb-2">
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
