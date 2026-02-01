import { useSearch } from "@tanstack/react-router";
import { trpc } from "../lib/trpc";
import { Spinner } from "../components/ui/spinner";
import { Button } from "../components/ui/button";

export function NowPlayingPage() {
	const search = useSearch({ strict: false }) as { station?: string };
	const stationToken = search.station;

	const playlistQuery = trpc.playback.getPlaylist.useQuery(
		{ stationToken: stationToken ?? "", quality: "high" },
		{ enabled: !!stationToken },
	);

	if (!stationToken) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-zinc-500">Select a station to start listening</p>
			</div>
		);
	}

	if (playlistQuery.isLoading) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<Spinner />
			</div>
		);
	}

	const items = playlistQuery.data?.items ?? [];
	const currentTrack = items[0];

	if (!currentTrack) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-zinc-500">No tracks available</p>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
			<div className="w-64 h-64 bg-zinc-800 rounded-lg flex items-center justify-center">
				<span className="text-6xl">&#127925;</span>
			</div>
			<div className="text-center">
				<h2 className="text-xl font-bold text-zinc-100">
					{currentTrack.songName}
				</h2>
				<p className="text-zinc-400">{currentTrack.artistName}</p>
				<p className="text-zinc-500 text-sm">{currentTrack.albumName}</p>
			</div>
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="icon">
					&#128078;
				</Button>
				<Button size="icon" className="h-14 w-14 rounded-full">
					&#9654;
				</Button>
				<Button variant="ghost" size="icon">
					&#128077;
				</Button>
			</div>
			<div className="flex items-center gap-4">
				<Button variant="ghost" size="sm">
					&#9197; Skip
				</Button>
				<Button variant="ghost" size="sm">
					&#128278; Bookmark
				</Button>
				<Button variant="ghost" size="sm">
					&#128564; Sleep
				</Button>
			</div>
		</div>
	);
}
