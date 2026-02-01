import { useState, useEffect, useCallback, useRef } from "react";
import { useSearch } from "@tanstack/react-router";
import {
	ThumbsUp,
	ThumbsDown,
	Play,
	Pause,
	SkipForward,
	SkipBack,
	Bookmark,
	Moon,
	Music,
	Info,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { NowPlayingSkeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";
import { usePlaybackContext } from "../contexts/PlaybackContext";
import { TrackInfoModal } from "../components/playback/TrackInfoModal";
import type { CanonicalTrack } from "../../sources/types";
import type { SourceType } from "../../sources/types";
import type { PlaylistItem } from "../../types/api";

function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins)}:${String(secs).padStart(2, "0")}`;
}

// Build a stream URL for a track from any source, with optional next-track prefetch hint
function buildStreamUrl(source: SourceType, trackId: string, nextCompositeId?: string): string {
	const base = `/stream/${encodeURIComponent(`${source}:${trackId}`)}`;
	if (!nextCompositeId) return base;
	return `${base}?next=${encodeURIComponent(nextCompositeId)}`;
}

// Unified track shape used by NowPlayingPage
type NowPlayingTrack = {
	readonly trackToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly albumArtUrl?: string;
	readonly source: SourceType;
	readonly duration?: number;
};

// Convert a Pandora PlaylistItem to NowPlayingTrack
function pandoraItemToTrack(item: PlaylistItem): NowPlayingTrack {
	return {
		trackToken: item.trackToken,
		songName: item.songName,
		artistName: item.artistName,
		albumName: item.albumName,
		...(item.albumArtUrl != null
			? { albumArtUrl: item.albumArtUrl }
			: {}),
		source: "pandora",
	};
}

// Convert a CanonicalTrack to NowPlayingTrack
function canonicalToTrack(
	track: CanonicalTrack,
	source: SourceType,
): NowPlayingTrack {
	return {
		trackToken: track.id,
		songName: track.title,
		artistName: track.artist,
		albumName: track.album,
		...(track.artworkUrl != null
			? { albumArtUrl: track.artworkUrl }
			: {}),
		...(track.duration != null ? { duration: track.duration } : {}),
		source,
	};
}

// Convert an album track DB row to NowPlayingTrack
type AlbumTrackRow = {
	readonly id: string;
	readonly trackIndex: number;
	readonly title: string;
	readonly artist: string;
	readonly duration: number | null;
	readonly source: string;
	readonly sourceTrackId: string;
	readonly artworkUrl: string | null;
};

function albumTrackToNowPlaying(
	track: AlbumTrackRow,
	albumName: string,
	albumArtUrl: string | null,
): NowPlayingTrack {
	const artUrl = track.artworkUrl ?? albumArtUrl;
	return {
		trackToken: track.sourceTrackId,
		songName: track.title,
		artistName: track.artist,
		albumName,
		...(artUrl != null ? { albumArtUrl: artUrl } : {}),
		source: track.source as SourceType,
		...(track.duration != null ? { duration: track.duration } : {}),
	};
}

// Get the audio URL for a track, with optional next-track prefetch hint
function getAudioUrlForTrack(track: NowPlayingTrack, nextTrack?: NowPlayingTrack): string {
	const nextCompositeId = nextTrack ? `${nextTrack.source}:${nextTrack.trackToken}` : undefined;
	return buildStreamUrl(track.source, track.trackToken, nextCompositeId);
}

function playTrackAtIndex(
	index: number,
	tracks: readonly NowPlayingTrack[],
	playback: ReturnType<typeof usePlaybackContext>,
) {
	const track = tracks[index];
	if (!track) return;
	const nextTrack = tracks[index + 1];
	const audioUrl = getAudioUrlForTrack(track, nextTrack);
	playback.playTrack({
		trackToken: track.trackToken,
		songName: track.songName,
		artistName: track.artistName,
		albumName: track.albumName,
		audioUrl,
		...(track.albumArtUrl != null ? { artUrl: track.albumArtUrl } : {}),
		source: track.source,
	});
}

export function NowPlayingPage() {
	const search = useSearch({ strict: false }) as {
		station?: string;
		source?: SourceType;
		playlist?: string;
		album?: string;
	};

	// Determine playback mode
	const isAlbumMode = !!search.album;
	const isUnifiedMode = !!search.source && !!search.playlist;
	const stationToken = search.station;
	const playlistSource = search.source ?? "pandora";
	const playlistId = search.playlist ?? stationToken ?? "";
	const albumId = search.album ?? "";

	const playback = usePlaybackContext();
	const [trackIndex, setTrackIndex] = useState(0);
	const [showTrackInfo, setShowTrackInfo] = useState(false);
	const hasStartedRef = useRef(false);
	const [tracks, setTracks] = useState<readonly NowPlayingTrack[]>([]);
	const [albumMeta, setAlbumMeta] = useState<{
		readonly title: string;
		readonly artist: string;
		readonly artworkUrl: string | null;
	} | null>(null);

	// Album tracks query
	const albumTracksQuery = trpc.collection.getAlbumTracks.useQuery(
		{ albumId },
		{ enabled: isAlbumMode },
	);
	const albumsQuery = trpc.collection.listAlbums.useQuery(undefined, {
		enabled: isAlbumMode,
	});

	// Legacy Pandora playlist query
	const pandoraPlaylistQuery = trpc.playback.getPlaylist.useQuery(
		{ stationToken: stationToken ?? "", quality: "high" },
		{ enabled: !!stationToken && !isUnifiedMode && !isAlbumMode },
	);

	// Unified playlist query
	const unifiedPlaylistQuery = trpc.playlists.getTracks.useQuery(
		{ source: playlistSource, playlistId },
		{ enabled: isUnifiedMode && !isAlbumMode },
	);

	// Normalize tracks from either query
	useEffect(() => {
		if (isAlbumMode && albumTracksQuery.data && albumsQuery.data) {
			const albumInfo = albumsQuery.data.find((a) => a.id === albumId);
			if (albumInfo) {
				setAlbumMeta({
					title: albumInfo.title,
					artist: albumInfo.artist,
					artworkUrl: albumInfo.artworkUrl,
				});
			}
			setTracks(
				albumTracksQuery.data.map((t) =>
					albumTrackToNowPlaying(
						t,
						albumInfo?.title ?? "",
						albumInfo?.artworkUrl ?? null,
					),
				),
			);
		} else if (!isAlbumMode && !isUnifiedMode && pandoraPlaylistQuery.data) {
			setTracks(pandoraPlaylistQuery.data.map(pandoraItemToTrack));
		} else if (!isAlbumMode && isUnifiedMode && unifiedPlaylistQuery.data) {
			setTracks(
				unifiedPlaylistQuery.data.map((t) =>
					canonicalToTrack(t, playlistSource),
				),
			);
		}
	}, [
		isAlbumMode,
		isUnifiedMode,
		albumTracksQuery.data,
		albumsQuery.data,
		pandoraPlaylistQuery.data,
		unifiedPlaylistQuery.data,
		playlistSource,
		albumId,
	]);

	const isPandora =
		!isAlbumMode && !isUnifiedMode && playlistSource === "pandora";

	const feedbackMutation = trpc.playback.addFeedback.useMutation({
		onError(err) {
			toast.error(`Feedback failed: ${err.message}`);
		},
	});
	const sleepMutation = trpc.playback.sleepSong.useMutation({
		onSuccess() {
			toast.success("Track will be skipped for 30 days");
		},
		onError(err) {
			toast.error(`Sleep failed: ${err.message}`);
		},
	});
	const bookmarkSongMutation = trpc.bookmarks.addSong.useMutation({
		onSuccess() {
			toast.success("Song bookmarked");
		},
		onError(err) {
			toast.error(`Bookmark failed: ${err.message}`);
		},
	});

	// Surface audio errors as toast notifications
	useEffect(() => {
		if (playback.error) {
			toast.error(`Audio error: ${playback.error}`);
			playback.clearError();
		}
	}, [playback.error, playback.clearError]);

	const currentTrack = tracks[trackIndex];

	// Auto-play first track when tracks load
	useEffect(() => {
		if (currentTrack && !hasStartedRef.current) {
			playTrackAtIndex(0, tracks, playback);
			hasStartedRef.current = true;
		}
	}, [currentTrack, playback, tracks]);

	// Set the current station token when playing from a station
	useEffect(() => {
		if (isAlbumMode) {
			playback.setCurrentStationToken(albumId);
		} else if (stationToken) {
			playback.setCurrentStationToken(stationToken);
		} else if (playlistId) {
			playback.setCurrentStationToken(playlistId);
		}
	}, [isAlbumMode, albumId, stationToken, playlistId, playback]);

	const handleSkip = useCallback(() => {
		const nextIndex = trackIndex + 1;
		if (nextIndex < tracks.length) {
			setTrackIndex(nextIndex);
			playTrackAtIndex(nextIndex, tracks, playback);
		} else if (isAlbumMode) {
			// Album mode: stop at end
			playback.stop();
		} else {
			// Playlist/station mode: refetch for more tracks
			if (!isUnifiedMode) {
				pandoraPlaylistQuery.refetch();
			} else {
				unifiedPlaylistQuery.refetch();
			}
			setTrackIndex(0);
			hasStartedRef.current = false;
		}
	}, [
		trackIndex,
		tracks,
		playback,
		isAlbumMode,
		isUnifiedMode,
		pandoraPlaylistQuery,
		unifiedPlaylistQuery,
	]);

	const handlePrevious = useCallback(() => {
		if (trackIndex > 0) {
			const prevIndex = trackIndex - 1;
			setTrackIndex(prevIndex);
			playTrackAtIndex(prevIndex, tracks, playback);
		}
	}, [trackIndex, tracks, playback]);

	const handleJumpToTrack = useCallback(
		(index: number) => {
			setTrackIndex(index);
			playTrackAtIndex(index, tracks, playback);
		},
		[tracks, playback],
	);

	// Auto-advance to next track when current track ends
	useEffect(() => {
		playback.setOnTrackEnd(handleSkip);
		return () => {
			playback.setOnTrackEnd(null);
		};
	}, [playback, handleSkip]);

	const handleLike = useCallback(() => {
		if (!stationToken || !currentTrack || !isPandora) return;
		feedbackMutation.mutate({
			stationToken,
			trackToken: currentTrack.trackToken,
			isPositive: true,
		});
	}, [stationToken, currentTrack, feedbackMutation, isPandora]);

	const handleDislike = useCallback(() => {
		if (!stationToken || !currentTrack || !isPandora) return;
		feedbackMutation.mutate({
			stationToken,
			trackToken: currentTrack.trackToken,
			isPositive: false,
		});
		handleSkip();
	}, [
		stationToken,
		currentTrack,
		feedbackMutation,
		handleSkip,
		isPandora,
	]);

	const handleSleep = useCallback(() => {
		if (!currentTrack || !isPandora) return;
		sleepMutation.mutate({ trackToken: currentTrack.trackToken });
		handleSkip();
	}, [currentTrack, sleepMutation, handleSkip, isPandora]);

	const handleBookmark = useCallback(() => {
		if (!currentTrack || !isPandora) return;
		bookmarkSongMutation.mutate({
			trackToken: currentTrack.trackToken,
		});
	}, [currentTrack, bookmarkSongMutation, isPandora]);

	if (!stationToken && !isUnifiedMode && !isAlbumMode) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-[var(--color-text-dim)]">
					Select a playlist to start listening
				</p>
			</div>
		);
	}

	const isLoading = isAlbumMode
		? albumTracksQuery.isLoading || albumsQuery.isLoading
		: isUnifiedMode
			? unifiedPlaylistQuery.isLoading
			: pandoraPlaylistQuery.isLoading;

	if (isLoading) {
		return <NowPlayingSkeleton />;
	}

	if (!currentTrack) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-[var(--color-text-dim)]">
					No tracks available
				</p>
			</div>
		);
	}

	const progressPercent =
		playback.duration > 0
			? (playback.progress / playback.duration) * 100
			: 0;

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
			{/* Album art */}
			<div className="w-56 h-56 md:w-72 md:h-72 relative">
				{playback.currentTrack?.artUrl ? (
					<img
						src={playback.currentTrack.artUrl}
						alt={`${currentTrack.albumName} album art`}
						className="w-full h-full rounded-2xl shadow-2xl object-cover"
						onError={(e) => {
							e.currentTarget.style.display = "none";
							e.currentTarget.nextElementSibling?.classList.remove(
								"hidden",
							);
						}}
					/>
				) : null}
				<div
					className={`w-full h-full bg-[var(--color-bg-highlight)] rounded-2xl shadow-2xl flex items-center justify-center ${playback.currentTrack?.artUrl ? "hidden absolute inset-0" : ""}`}
				>
					<Music className="w-20 h-20 text-[var(--color-text-dim)]" />
				</div>
				{playback.isPlaying && (
					<div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-[var(--color-playing)] rounded-full text-xs font-medium text-[var(--color-bg)]">
						PLAYING
					</div>
				)}
			</div>

			{/* Track info */}
			<div className="text-center">
				<h2 className="text-2xl md:text-3xl font-bold text-[var(--color-text)]">
					{currentTrack.songName}
				</h2>
				<p className="text-lg text-[var(--color-text-muted)] mt-1">
					{currentTrack.artistName}
				</p>
				{isAlbumMode && albumMeta ? (
					<p className="text-sm text-[var(--color-text-dim)]">
						{albumMeta.title}
					</p>
				) : (
					<p className="text-sm text-[var(--color-text-dim)]">
						{currentTrack.albumName}
					</p>
				)}
			</div>

			{/* Progress bar */}
			<div className="w-full max-w-md">
				<div className="h-1 bg-[var(--color-progress-track)] rounded-full overflow-hidden">
					<div
						className="h-full bg-[var(--color-progress)] transition-all duration-300"
						style={{
							width: `${String(progressPercent)}%`,
						}}
					/>
				</div>
				<div className="flex justify-between text-xs text-[var(--color-text-dim)] mt-1">
					<span>{formatTime(playback.progress)}</span>
					<span>{formatTime(playback.duration)}</span>
				</div>
			</div>

			{/* Primary controls */}
			<div
				className="flex items-center gap-6"
				role="group"
				aria-label="Playback controls"
			>
				{isPandora && (
					<Button
						variant="ghost"
						size="icon"
						className="text-[var(--color-disliked)] h-12 w-12"
						onClick={handleDislike}
						aria-label="Dislike this track"
					>
						<ThumbsDown className="w-6 h-6" />
					</Button>
				)}
				{isAlbumMode && (
					<Button
						variant="ghost"
						size="icon"
						className="h-12 w-12"
						onClick={handlePrevious}
						disabled={trackIndex === 0}
						aria-label="Previous track"
					>
						<SkipBack className="w-6 h-6" />
					</Button>
				)}
				<Button
					size="icon"
					className="h-14 w-14 rounded-full bg-[var(--color-primary)] hover:brightness-110 text-[var(--color-bg)]"
					onClick={playback.togglePlayPause}
					aria-label={playback.isPlaying ? "Pause" : "Play"}
				>
					{playback.isPlaying ? (
						<Pause className="w-7 h-7" />
					) : (
						<Play className="w-7 h-7 ml-0.5" />
					)}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="h-12 w-12"
					onClick={handleSkip}
					disabled={
						isAlbumMode && trackIndex >= tracks.length - 1
					}
					aria-label="Skip to next track"
				>
					<SkipForward className="w-6 h-6" />
				</Button>
				{isPandora && (
					<Button
						variant="ghost"
						size="icon"
						className="text-[var(--color-liked)] h-12 w-12"
						onClick={handleLike}
						aria-label="Like this track"
					>
						<ThumbsUp className="w-6 h-6" />
					</Button>
				)}
			</div>

			{/* Secondary actions - Pandora only */}
			{isPandora && (
				<div className="flex items-center gap-4 text-[var(--color-text-dim)]">
					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5"
						onClick={() => setShowTrackInfo(true)}
						title="Track info"
					>
						<Info className="w-4 h-4" />
						Info
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5"
						onClick={handleBookmark}
						title="Bookmark song"
					>
						<Bookmark className="w-4 h-4" />
						Bookmark
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="gap-1.5"
						onClick={handleSleep}
						title="Sleep song (30 days)"
					>
						<Moon className="w-4 h-4" />
						Sleep
					</Button>
				</div>
			)}

			{/* Up Next queue - shown for station/playlist modes (not album mode) */}
			{!isAlbumMode &&
				(() => {
					const upNextTracks = tracks.slice(
						trackIndex + 1,
						trackIndex + 5,
					);
					const remainingCount = tracks.length - trackIndex - 1;
					if (upNextTracks.length === 0) return null;
					return (
						<div className="w-full max-w-md">
							<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
								Up Next
							</h3>
							<div className="space-y-0.5">
								{upNextTracks.map((track, i) => (
									<button
										key={track.trackToken}
										type="button"
										onClick={() =>
											handleJumpToTrack(
												trackIndex + 1 + i,
											)
										}
										className="w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-highlight)] transition-colors"
									>
										<span className="w-5 text-right text-xs text-[var(--color-text-dim)]">
											{String(i + 1)}
										</span>
										<span className="flex-1 truncate">
											{track.songName}
										</span>
										<span className="text-xs text-[var(--color-text-dim)] truncate max-w-[140px]">
											{track.artistName}
										</span>
									</button>
								))}
								{remainingCount > 4 && (
									<p className="text-xs text-[var(--color-text-dim)] px-3 py-1">
										+{String(remainingCount - 4)} more
									</p>
								)}
							</div>
						</div>
					);
				})()}

			{/* Album track list */}
			{isAlbumMode && tracks.length > 0 && (
				<div className="w-full max-w-md">
					<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">
						Tracklist
					</h3>
					<div className="space-y-0.5 max-h-48 overflow-y-auto">
						{tracks.map((track, index) => {
							const isActive = index === trackIndex;
							return (
								<button
									key={track.trackToken}
									type="button"
									onClick={() => handleJumpToTrack(index)}
									className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm transition-colors ${
										isActive
											? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium"
											: "text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-highlight)]"
									}`}
								>
									<span className="w-5 text-right text-xs">
										{String(index + 1)}
									</span>
									<span className="flex-1 truncate">
										{track.songName}
									</span>
									{track.duration != null && (
										<span className="text-xs">
											{formatTime(track.duration)}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}

			{isPandora && showTrackInfo && currentTrack && (
				<TrackInfoModal
					track={{
						trackToken: currentTrack.trackToken,
						songName: currentTrack.songName,
						artistName: currentTrack.artistName,
						albumName: currentTrack.albumName,
						...(currentTrack.albumArtUrl != null
							? { albumArtUrl: currentTrack.albumArtUrl }
							: {}),
					}}
					duration={playback.duration}
					onClose={() => setShowTrackInfo(false)}
				/>
			)}
		</div>
	);
}
