import { useState, useEffect, useCallback, useRef } from "react";
import { useSearch } from "@tanstack/react-router";
import {
	ThumbsUp,
	ThumbsDown,
	Play,
	Pause,
	SkipForward,
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

// Build a stream URL for a track from any source
function buildStreamUrl(source: SourceType, trackId: string): string {
	return `/stream/${encodeURIComponent(`${source}:${trackId}`)}`;
}

// Unified track shape used by NowPlayingPage
type NowPlayingTrack = {
	readonly trackToken: string;
	readonly songName: string;
	readonly artistName: string;
	readonly albumName: string;
	readonly albumArtUrl?: string;
	readonly source: SourceType;
};

// Convert a Pandora PlaylistItem to NowPlayingTrack
function pandoraItemToTrack(item: PlaylistItem): NowPlayingTrack {
	return {
		trackToken: item.trackToken,
		songName: item.songName,
		artistName: item.artistName,
		albumName: item.albumName,
		...(item.albumArtUrl != null ? { albumArtUrl: item.albumArtUrl } : {}),
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
		...(track.artworkUrl != null ? { albumArtUrl: track.artworkUrl } : {}),
		source,
	};
}

// Get the audio URL for a track, using stream proxy for all sources
function getAudioUrlForTrack(track: NowPlayingTrack): string {
	return buildStreamUrl(track.source, track.trackToken);
}

export function NowPlayingPage() {
	const search = useSearch({ strict: false }) as {
		station?: string;
		source?: SourceType;
		playlist?: string;
	};

	// Determine playback mode: legacy Pandora station or unified playlist
	const isUnifiedMode = !!search.source && !!search.playlist;
	const stationToken = search.station;
	const playlistSource = search.source ?? "pandora";
	const playlistId = search.playlist ?? stationToken ?? "";

	const playback = usePlaybackContext();
	const [trackIndex, setTrackIndex] = useState(0);
	const [showTrackInfo, setShowTrackInfo] = useState(false);
	const hasStartedRef = useRef(false);
	const [tracks, setTracks] = useState<readonly NowPlayingTrack[]>([]);

	// Legacy Pandora playlist query
	const pandoraPlaylistQuery = trpc.playback.getPlaylist.useQuery(
		{ stationToken: stationToken ?? "", quality: "high" },
		{ enabled: !!stationToken && !isUnifiedMode },
	);

	// Unified playlist query
	const unifiedPlaylistQuery = trpc.playlists.getTracks.useQuery(
		{ source: playlistSource, playlistId },
		{ enabled: isUnifiedMode },
	);

	// Normalize tracks from either query
	useEffect(() => {
		if (!isUnifiedMode && pandoraPlaylistQuery.data) {
			setTracks(pandoraPlaylistQuery.data.map(pandoraItemToTrack));
		} else if (isUnifiedMode && unifiedPlaylistQuery.data) {
			setTracks(
				unifiedPlaylistQuery.data.map((t) =>
					canonicalToTrack(t, playlistSource),
				),
			);
		}
	}, [
		isUnifiedMode,
		pandoraPlaylistQuery.data,
		unifiedPlaylistQuery.data,
		playlistSource,
	]);

	const isPandora = playlistSource === "pandora";

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

	const currentTrack = tracks[trackIndex];

	// Auto-play first track when tracks load
	useEffect(() => {
		if (currentTrack && !hasStartedRef.current) {
			const audioUrl = getAudioUrlForTrack(currentTrack);
			playback.playTrack({
				trackToken: currentTrack.trackToken,
				songName: currentTrack.songName,
				artistName: currentTrack.artistName,
				albumName: currentTrack.albumName,
				audioUrl,
				...(currentTrack.albumArtUrl != null ? { artUrl: currentTrack.albumArtUrl } : {}),
				source: currentTrack.source,
			});
			hasStartedRef.current = true;
		}
	}, [currentTrack, playback]);

	// Set the current station token when playing from a station
	useEffect(() => {
		if (stationToken) {
			playback.setCurrentStationToken(stationToken);
		} else if (playlistId) {
			playback.setCurrentStationToken(playlistId);
		}
	}, [stationToken, playlistId, playback]);

	const handleSkip = useCallback(() => {
		const nextIndex = trackIndex + 1;
		if (nextIndex < tracks.length) {
			setTrackIndex(nextIndex);
			const next = tracks[nextIndex];
			if (next) {
				const audioUrl = getAudioUrlForTrack(next);
				playback.playTrack({
					trackToken: next.trackToken,
					songName: next.songName,
					artistName: next.artistName,
					albumName: next.albumName,
					audioUrl,
					...(next.albumArtUrl != null ? { artUrl: next.albumArtUrl } : {}),
					source: next.source,
				});
			}
		} else {
			// Refetch playlist for more tracks
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
		isUnifiedMode,
		pandoraPlaylistQuery,
		unifiedPlaylistQuery,
	]);

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
	}, [stationToken, currentTrack, feedbackMutation, handleSkip, isPandora]);

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

	if (!stationToken && !isUnifiedMode) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-[var(--color-text-dim)]">
					Select a playlist to start listening
				</p>
			</div>
		);
	}

	const isLoading = isUnifiedMode
		? unifiedPlaylistQuery.isLoading
		: pandoraPlaylistQuery.isLoading;

	if (isLoading) {
		return <NowPlayingSkeleton />;
	}

	if (!currentTrack) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-[var(--color-text-dim)]">No tracks available</p>
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
			<div className="w-64 h-64 md:w-80 md:h-80 relative">
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

			{/* Track info */}
			<div className="text-center">
				<h2 className="text-2xl md:text-3xl font-bold text-[var(--color-text)]">
					{currentTrack.songName}
				</h2>
				<p className="text-lg text-[var(--color-text-muted)] mt-1">
					{currentTrack.artistName}
				</p>
				<p className="text-sm text-[var(--color-text-dim)]">{currentTrack.albumName}</p>
			</div>

			{/* Progress bar */}
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

			{/* Primary controls */}
			<div className="flex items-center gap-6" role="group" aria-label="Playback controls">
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

			{isPandora && showTrackInfo && currentTrack && (
				<TrackInfoModal
					track={{
						trackToken: currentTrack.trackToken,
						songName: currentTrack.songName,
						artistName: currentTrack.artistName,
						albumName: currentTrack.albumName,
						...(currentTrack.albumArtUrl != null ? { albumArtUrl: currentTrack.albumArtUrl } : {}),
					}}
					duration={playback.duration}
					onClose={() => setShowTrackInfo(false)}
				/>
			)}
		</div>
	);
}
