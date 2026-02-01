import { useNavigate } from "@tanstack/react-router";
import { Play, Plus, Music, ListMusic, Disc3 } from "lucide-react";
import { trpc } from "../lib/trpc";
import { usePlaybackContext } from "../contexts/PlaybackContext";
import type { CanonicalPlaylist } from "../../sources/types";
import type { SourceType } from "../../sources/types";

function sourceLabel(source: SourceType): string {
	switch (source) {
		case "pandora":
			return "Pandora";
		case "ytmusic":
			return "YouTube Music";
		case "local":
			return "Local";
	}
}

function sourceGradient(source: SourceType): string {
	switch (source) {
		case "pandora":
			return "from-indigo-600 to-purple-800";
		case "ytmusic":
			return "from-red-600 to-red-900";
		case "local":
			return "from-emerald-600 to-teal-800";
	}
}

function sourceLabelColor(source: SourceType): string {
	switch (source) {
		case "pandora":
			return "text-indigo-200/60";
		case "ytmusic":
			return "text-red-200/60";
		case "local":
			return "text-emerald-200/60";
	}
}

function PlaylistCard({
	playlist,
	onPlay,
}: {
	readonly playlist: CanonicalPlaylist;
	readonly onPlay: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPlay}
			className="group cursor-pointer text-left"
		>
			<div
				className={`aspect-square bg-gradient-to-br ${sourceGradient(playlist.source)} rounded-lg mb-2 flex items-center justify-center relative overflow-hidden`}
			>
				{playlist.artworkUrl ? (
					<img
						src={playlist.artworkUrl}
						alt={playlist.name}
						className="w-full h-full object-cover"
					/>
				) : (
					<ListMusic
						className={`w-8 h-8 ${sourceLabelColor(playlist.source)}`}
					/>
				)}
				<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
					<div className="opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--color-primary)] rounded-full p-2.5 shadow-lg">
						<Play className="w-5 h-5 text-[var(--color-bg)]" fill="currentColor" />
					</div>
				</div>
			</div>
			<p className="text-sm font-medium text-[var(--color-text)] truncate">
				{playlist.name}
			</p>
			<p className="text-xs text-[var(--color-text-dim)]">
				{sourceLabel(playlist.source)}
			</p>
		</button>
	);
}

type AlbumData = {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly year: number | null;
	readonly artworkUrl: string | null;
};

function AlbumCard({
	album,
	onPlay,
}: {
	readonly album: AlbumData;
	readonly onPlay: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPlay}
			className="group cursor-pointer text-left"
		>
			<div className="aspect-square bg-[var(--color-bg-highlight)] rounded-lg mb-2 relative overflow-hidden">
				{album.artworkUrl ? (
					<img
						src={album.artworkUrl}
						alt={album.title}
						className="w-full h-full object-cover"
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center">
						<Disc3 className="w-12 h-12 text-[var(--color-text-dim)]" />
					</div>
				)}
				<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
					<div className="opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--color-primary)] rounded-full p-2.5 shadow-lg">
						<Play className="w-5 h-5 text-[var(--color-bg)]" fill="currentColor" />
					</div>
				</div>
			</div>
			<p className="text-sm font-medium text-[var(--color-text)] truncate">
				{album.title}
			</p>
			<p className="text-xs text-[var(--color-text-dim)]">
				{album.artist}
				{album.year ? ` \u00B7 ${String(album.year)}` : ""}
			</p>
		</button>
	);
}

export function HomePage() {
	const navigate = useNavigate();
	const playlistsQuery = trpc.playlists.list.useQuery();
	const albumsQuery = trpc.collection.listAlbums.useQuery();

	const playlists = playlistsQuery.data ?? [];
	const albums = albumsQuery.data ?? [];

	const handlePlayPlaylist = (playlist: CanonicalPlaylist) => {
		navigate({
			to: "/now-playing",
			search: {
				source: playlist.source,
				playlist: playlist.id,
			},
		});
	};

	return (
		<div className="flex-1 p-6 space-y-10">
			{/* My Playlists Section */}
			<section>
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold text-[var(--color-text)]">
						My Playlists
					</h2>
					<button
						type="button"
						onClick={() => navigate({ to: "/stations" })}
						className="text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
					>
						See all
					</button>
				</div>
				{playlistsQuery.isLoading ? (
					<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
						{Array.from({ length: 5 }, (_, i) => (
							<div key={i}>
								<div className="aspect-square bg-[var(--color-bg-highlight)] rounded-lg mb-2 animate-pulse" />
								<div className="h-4 bg-[var(--color-bg-highlight)] rounded animate-pulse mb-1 w-3/4" />
								<div className="h-3 bg-[var(--color-bg-highlight)] rounded animate-pulse w-1/2" />
							</div>
						))}
					</div>
				) : playlists.length === 0 ? (
					<p className="text-sm text-[var(--color-text-dim)]">
						No playlists found. Create a station to get started.
					</p>
				) : (
					<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
						{playlists.map((playlist) => (
							<PlaylistCard
								key={`${playlist.source}-${playlist.id}`}
								playlist={playlist}
								onPlay={() => handlePlayPlaylist(playlist)}
							/>
						))}
					</div>
				)}
			</section>

			{/* My Albums Section */}
			<section>
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-lg font-semibold text-[var(--color-text)]">
						My Albums
					</h2>
				</div>
				<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
					{albums.map((album) => (
						<AlbumCard
							key={album.id}
							album={album}
							onPlay={() => {
								navigate({
									to: "/now-playing",
									search: { album: album.id },
								});
							}}
						/>
					))}
					{/* Add album placeholder */}
					<button
						type="button"
						className="aspect-square border-2 border-dashed border-[var(--color-border)] rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-[var(--color-text-dim)] transition-colors"
						onClick={() => navigate({ to: "/search" })}
					>
						<Plus className="w-8 h-8 text-[var(--color-text-dim)] mb-1" />
						<span className="text-xs text-[var(--color-text-dim)]">
							Add album
						</span>
					</button>
				</div>
			</section>
		</div>
	);
}
