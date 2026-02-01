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

function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins)}:${String(secs).padStart(2, "0")}`;
}

// Capability flags from server
type TrackCapabilities = {
	readonly feedback: boolean;
	readonly sleep: boolean;
	readonly bookmark: boolean;
	readonly explain: boolean;
	readonly radio: boolean;
};

// Unified track shape — all IDs are opaque
type NowPlayingTrack = {
	readonly id: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly albumArtUrl?: string;
	readonly capabilities: TrackCapabilities;
	readonly duration?: number;
};

// Convert a radio track to NowPlayingTrack
function radioTrackToNowPlaying(track: {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly album: string;
	readonly artworkUrl?: string;
	readonly capabilities: TrackCapabilities;
}): NowPlayingTrack {
	return {
		id: track.id,
		songName: track.title,
		artistName: track.artist,
		albumName: track.album,
		...(track.artworkUrl != null ? { albumArtUrl: track.artworkUrl } : {}),
		capabilities: track.capabilities,
	};
}

// Convert a playlist track to NowPlayingTrack
function playlistTrackToNowPlaying(track: {
	readonly id: string;
	readonly title: string;
	readonly artist: string;
	readonly album: string;
	readonly artworkUrl?: string;
	readonly duration?: number;
	readonly capabilities: TrackCapabilities;
}): NowPlayingTrack {
	return {
		id: track.id,
		songName: track.title,
		artistName: track.artist,
		albumName: track.album,
		...(track.artworkUrl != null ? { albumArtUrl: track.artworkUrl } : {}),
		...(track.duration != null ? { duration: track.duration } : {}),
		capabilities: track.capabilities,
	};
}

// Convert an album track row to NowPlayingTrack
type AlbumTrackRow = {
	readonly id: string;
	readonly trackIndex: number;
	readonly title: string;
	readonly artist: string;
	readonly duration: number | null;
	readonly artworkUrl: string | null;
	readonly capabilities: TrackCapabilities;
};

function albumTrackToNowPlaying(
	track: AlbumTrackRow,
	albumName: string,
	albumArtUrl: string | null,
): NowPlayingTrack {
	const artUrl = track.artworkUrl ?? albumArtUrl;
	return {
		id: track.id,
		songName: track.title,
		artistName: track.artist,
		albumName,
		...(artUrl != null ? { albumArtUrl: artUrl } : {}),
		capabilities: track.capabilities,
		...(track.duration != null ? { duration: track.duration } : {}),
	};
}

function tracksToQueuePayload(tracks: readonly NowPlayingTrack[]) {
	return tracks.map((t) => ({
		id: t.id,
		title: t.songName,
		artist: t.artistName,
		album: t.albumName,
		duration: t.duration ?? null,
		artworkUrl: t.albumArtUrl ?? null,
	}));
}

export function NowPlayingPage() {
	const search = useSearch({ strict: false }) as {
		station?: string;
		playlist?: string;
		album?: string;
	};

	const isAlbumMode = !!search.album;
	const isPlaylistMode = !!search.playlist;
	const radioId = search.station;
	const playlistId = search.playlist;
	const albumId = search.album ?? "";

	const playback = usePlaybackContext();
	const [showTrackInfo, setShowTrackInfo] = useState(false);
	const hasStartedRef = useRef(false);
	const [tracks, setTracks] = useState<readonly NowPlayingTrack[]>([]);
	const [trackIndex, setTrackIndex] = useState(0);
	const [albumMeta, setAlbumMeta] = useState<{
		readonly title: string;
		readonly artist: string;
		readonly artworkUrl: string | null;
	} | null>(null);

	// Reset playback gate when switching context (album, playlist, or station)
	useEffect(() => {
		hasStartedRef.current = false;
	}, [radioId, playlistId, albumId]);

	// Subscribe to queue state to track current index
	trpc.queue.onChange.useSubscription(undefined, {
		onData(queueState) {
			setTrackIndex(queueState.currentIndex);
		},
	});

	// Album tracks query
	const albumTracksQuery = trpc.library.albumTracks.useQuery(
		{ albumId },
		{ enabled: isAlbumMode },
	);
	const albumsQuery = trpc.library.albums.useQuery(undefined, {
		enabled: isAlbumMode,
	});

	// Radio (Pandora station) query
	const radioQuery = trpc.radio.getTracks.useQuery(
		{ id: radioId ?? "", quality: "high" },
		{ enabled: !!radioId && !isPlaylistMode && !isAlbumMode },
	);

	// Playlist query
	const playlistQuery = trpc.playlist.getTracks.useQuery(
		{ id: playlistId ?? "" },
		{ enabled: isPlaylistMode && !isAlbumMode },
	);

	// When tracks are fetched, send them to the server queue and start playback
	useEffect(() => {
		let newTracks: readonly NowPlayingTrack[] = [];

		if (isAlbumMode && albumTracksQuery.data && albumsQuery.data) {
			const albumInfo = albumsQuery.data.find((a) => a.id === albumId);
			if (albumInfo) {
				setAlbumMeta({
					title: albumInfo.title,
					artist: albumInfo.artist,
					artworkUrl: albumInfo.artworkUrl,
				});
			}
			newTracks = albumTracksQuery.data.map((t) =>
				albumTrackToNowPlaying(
					t,
					albumInfo?.title ?? "",
					albumInfo?.artworkUrl ?? null,
				),
			);
		} else if (!isAlbumMode && !isPlaylistMode && radioQuery.data) {
			newTracks = radioQuery.data.map(radioTrackToNowPlaying);
		} else if (!isAlbumMode && isPlaylistMode && playlistQuery.data) {
			newTracks = playlistQuery.data.map(playlistTrackToNowPlaying);
		}

		if (newTracks.length > 0) {
			setTracks(newTracks);

			if (!hasStartedRef.current) {
				hasStartedRef.current = true;

				// Determine queue context
				const context = isAlbumMode
					? { type: "album" as const, albumId }
					: isPlaylistMode
						? { type: "playlist" as const, playlistId: playlistId ?? "" }
						: { type: "radio" as const, seedId: radioId ?? "" };

				// Send tracks to server and start playback
				playback.playMutation.mutate({
					tracks: tracksToQueuePayload(newTracks),
					context,
					startIndex: 0,
				});
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		isAlbumMode,
		isPlaylistMode,
		albumTracksQuery.data,
		albumsQuery.data,
		radioQuery.data,
		playlistQuery.data,
		albumId,
	]);

	const feedbackMutation = trpc.track.feedback.useMutation({
		onError(err) {
			toast.error(`Feedback failed: ${err.message}`);
		},
	});
	const sleepMutation = trpc.track.sleep.useMutation({
		onSuccess() {
			toast.success("Track will be skipped for 30 days");
		},
		onError(err) {
			toast.error(`Sleep failed: ${err.message}`);
		},
	});
	const bookmarkSongMutation = trpc.library.addBookmark.useMutation({
		onSuccess() {
			toast.success("Song bookmarked");
		},
		onError(err) {
			toast.error(`Bookmark failed: ${err.message}`);
		},
	});

	useEffect(() => {
		if (playback.error) {
			toast.error(`Audio error: ${playback.error}`);
			playback.clearError();
		}
	}, [playback.error, playback.clearError]);

	useEffect(() => {
		if (isAlbumMode) {
			playback.setCurrentStationToken(albumId);
		} else if (radioId) {
			playback.setCurrentStationToken(radioId);
		} else if (playlistId) {
			playback.setCurrentStationToken(playlistId);
		}
	}, [isAlbumMode, albumId, radioId, playlistId, playback]);

	const currentTrack = tracks[trackIndex];

	const handleSkip = useCallback(() => {
		const nextIndex = trackIndex + 1;
		if (nextIndex < tracks.length) {
			playback.jumpToMutation.mutate({ index: nextIndex });
		} else if (isAlbumMode) {
			playback.stop();
		} else {
			// Refetch more tracks for radio/playlist
			if (!isPlaylistMode) {
				radioQuery.refetch();
			} else {
				playlistQuery.refetch();
			}
			hasStartedRef.current = false;
		}
	}, [
		trackIndex,
		tracks,
		playback,
		isAlbumMode,
		isPlaylistMode,
		radioQuery,
		playlistQuery,
	]);

	const handlePrevious = useCallback(() => {
		if (trackIndex > 0) {
			playback.jumpToMutation.mutate({ index: trackIndex - 1 });
		}
	}, [trackIndex, playback]);

	const handleJumpToTrack = useCallback(
		(index: number) => {
			playback.jumpToMutation.mutate({ index });
		},
		[playback],
	);

	// Register track-end handler for auto-skip on audio end
	useEffect(() => {
		playback.setOnTrackEnd(handleSkip);
		return () => {
			playback.setOnTrackEnd(null);
		};
	}, [playback, handleSkip]);

	const handleLike = useCallback(() => {
		if (!radioId || !currentTrack?.capabilities.feedback) return;
		feedbackMutation.mutate({
			radioId,
			id: currentTrack.id,
			positive: true,
		});
	}, [radioId, currentTrack, feedbackMutation]);

	const handleDislike = useCallback(() => {
		if (!radioId || !currentTrack?.capabilities.feedback) return;
		feedbackMutation.mutate({
			radioId,
			id: currentTrack.id,
			positive: false,
		});
		handleSkip();
	}, [radioId, currentTrack, feedbackMutation, handleSkip]);

	const handleSleep = useCallback(() => {
		if (!currentTrack?.capabilities.sleep) return;
		sleepMutation.mutate({ id: currentTrack.id });
		handleSkip();
	}, [currentTrack, sleepMutation, handleSkip]);

	const handleBookmark = useCallback(() => {
		if (!currentTrack?.capabilities.bookmark) return;
		bookmarkSongMutation.mutate({ id: currentTrack.id, type: "song" });
	}, [currentTrack, bookmarkSongMutation]);

	if (!radioId && !isPlaylistMode && !isAlbumMode) {
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
		: isPlaylistMode
			? playlistQuery.isLoading
			: radioQuery.isLoading;

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
			<div className="w-56 h-56 md:w-72 md:h-72 relative">
				{playback.currentTrack?.artUrl ? (
					<img
						src={playback.currentTrack.artUrl}
						alt={`${currentTrack.albumName} album art`}
						className="w-full h-full rounded-2xl shadow-2xl object-cover"
						onError={(e) => {
							e.currentTarget.style.display = "none";
							e.currentTarget.nextElementSibling?.classList.remove("hidden");
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

			<div className="text-center">
				<h2 className="text-2xl md:text-3xl font-bold text-[var(--color-text)]">
					{currentTrack.songName}
				</h2>
				<p className="text-lg text-[var(--color-text-muted)] mt-1">
					{currentTrack.artistName}
				</p>
				{isAlbumMode && albumMeta ? (
					<p className="text-sm text-[var(--color-text-dim)]">{albumMeta.title}</p>
				) : (
					<p className="text-sm text-[var(--color-text-dim)]">{currentTrack.albumName}</p>
				)}
			</div>

			<div className="w-full max-w-md">
				<div className="h-1 bg-[var(--color-progress-track)] rounded-full overflow-hidden">
					<div
						className="h-full bg-[var(--color-progress)] transition-all duration-300"
						style={{ width: `${String(progressPercent)}%` }}
					/>
				</div>
				<div className="flex justify-between text-xs text-[var(--color-text-dim)] mt-1">
					<span>{formatTime(playback.progress)}</span>
					<span>{formatTime(playback.duration)}</span>
				</div>
			</div>

			<div className="flex items-center gap-6" role="group" aria-label="Playback controls">
				{currentTrack.capabilities.feedback && (
					<Button variant="ghost" size="icon" className="text-[var(--color-disliked)] h-12 w-12" onClick={handleDislike} aria-label="Dislike this track">
						<ThumbsDown className="w-6 h-6" />
					</Button>
				)}
				{isAlbumMode && (
					<Button variant="ghost" size="icon" className="h-12 w-12" onClick={handlePrevious} disabled={trackIndex === 0} aria-label="Previous track">
						<SkipBack className="w-6 h-6" />
					</Button>
				)}
				<Button size="icon" className="h-14 w-14 rounded-full bg-[var(--color-primary)] hover:brightness-110 text-[var(--color-bg)]" onClick={playback.togglePlayPause} aria-label={playback.isPlaying ? "Pause" : "Play"}>
					{playback.isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-0.5" />}
				</Button>
				<Button variant="ghost" size="icon" className="h-12 w-12" onClick={handleSkip} disabled={isAlbumMode && trackIndex >= tracks.length - 1} aria-label="Skip to next track">
					<SkipForward className="w-6 h-6" />
				</Button>
				{currentTrack.capabilities.feedback && (
					<Button variant="ghost" size="icon" className="text-[var(--color-liked)] h-12 w-12" onClick={handleLike} aria-label="Like this track">
						<ThumbsUp className="w-6 h-6" />
					</Button>
				)}
			</div>

			{(currentTrack.capabilities.explain || currentTrack.capabilities.bookmark || currentTrack.capabilities.sleep) && (
				<div className="flex items-center gap-4 text-[var(--color-text-dim)]">
					{currentTrack.capabilities.explain && (
						<Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setShowTrackInfo(true)} title="Track info">
							<Info className="w-4 h-4" /> Info
						</Button>
					)}
					{currentTrack.capabilities.bookmark && (
						<Button variant="ghost" size="sm" className="gap-1.5" onClick={handleBookmark} title="Bookmark song">
							<Bookmark className="w-4 h-4" /> Bookmark
						</Button>
					)}
					{currentTrack.capabilities.sleep && (
						<Button variant="ghost" size="sm" className="gap-1.5" onClick={handleSleep} title="Sleep song (30 days)">
							<Moon className="w-4 h-4" /> Sleep
						</Button>
					)}
				</div>
			)}

			{!isAlbumMode &&
				(() => {
					const upNextTracks = tracks.slice(trackIndex + 1, trackIndex + 5);
					const remainingCount = tracks.length - trackIndex - 1;
					if (upNextTracks.length === 0) return null;
					return (
						<div className="w-full max-w-md">
							<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Up Next</h3>
							<div className="space-y-0.5">
								{upNextTracks.map((track, i) => (
									<button key={track.id} type="button" onClick={() => handleJumpToTrack(trackIndex + 1 + i)} className="w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-highlight)] transition-colors">
										<span className="w-5 text-right text-xs text-[var(--color-text-dim)]">{String(i + 1)}</span>
										<span className="flex-1 truncate">{track.songName}</span>
										<span className="text-xs text-[var(--color-text-dim)] truncate max-w-[140px]">{track.artistName}</span>
									</button>
								))}
								{remainingCount > 4 && (
									<p className="text-xs text-[var(--color-text-dim)] px-3 py-1">+{String(remainingCount - 4)} more</p>
								)}
							</div>
						</div>
					);
				})()}

			{isAlbumMode && tracks.length > 0 && (
				<div className="w-full max-w-md">
					<h3 className="text-xs font-medium text-[var(--color-text-dim)] uppercase tracking-wider mb-2">Tracklist</h3>
					<div className="space-y-0.5 max-h-48 overflow-y-auto">
						{tracks.map((track, index) => {
							const isActive = index === trackIndex;
							return (
								<button key={track.id} type="button" onClick={() => handleJumpToTrack(index)} className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left text-sm transition-colors ${isActive ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium" : "text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-highlight)]"}`}>
									<span className="w-5 text-right text-xs">{String(index + 1)}</span>
									<span className="flex-1 truncate">{track.songName}</span>
									{track.duration != null && <span className="text-xs">{formatTime(track.duration)}</span>}
								</button>
							);
						})}
					</div>
				</div>
			)}

			{currentTrack.capabilities.explain && showTrackInfo && (
				<TrackInfoModal
					trackId={currentTrack.id}
					songName={currentTrack.songName}
					artistName={currentTrack.artistName}
					albumName={currentTrack.albumName}
					albumArtUrl={currentTrack.albumArtUrl}
					duration={playback.duration}
					onClose={() => setShowTrackInfo(false)}
				/>
			)}
		</div>
	);
}
