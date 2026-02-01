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
		return <p className="text-zinc-500 text-sm">No results found.</p>;
	}

	return (
		<div className="space-y-6">
			{artists && artists.length > 0 && (
				<section>
					<h3 className="text-sm font-semibold text-zinc-400 uppercase mb-2">
						Artists
					</h3>
					<ul className="space-y-1">
						{artists.map((artist) => (
							<li
								key={artist.musicToken}
								className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-zinc-800"
							>
								<span className="text-zinc-200">{artist.artistName}</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onCreateStation(artist.musicToken)}
								>
									+ Station
								</Button>
							</li>
						))}
					</ul>
				</section>
			)}
			{songs && songs.length > 0 && (
				<section>
					<h3 className="text-sm font-semibold text-zinc-400 uppercase mb-2">
						Songs
					</h3>
					<ul className="space-y-1">
						{songs.map((song) => (
							<li
								key={song.musicToken}
								className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-zinc-800"
							>
								<div>
									<p className="text-zinc-200">{song.songName}</p>
									<p className="text-xs text-zinc-500">{song.artistName}</p>
								</div>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onCreateStation(song.musicToken)}
								>
									+ Station
								</Button>
							</li>
						))}
					</ul>
				</section>
			)}
			{genreStations && genreStations.length > 0 && (
				<section>
					<h3 className="text-sm font-semibold text-zinc-400 uppercase mb-2">
						Genres
					</h3>
					<ul className="space-y-1">
						{genreStations.map((genre) => (
							<li
								key={genre.musicToken}
								className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-zinc-800"
							>
								<span className="text-zinc-200">{genre.stationName}</span>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onCreateStation(genre.musicToken)}
								>
									+ Station
								</Button>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
