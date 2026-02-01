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
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { NowPlayingSkeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";
import { usePlaybackContext } from "../contexts/PlaybackContext";

function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins)}:${String(secs).padStart(2, "0")}`;
}

export function NowPlayingPage() {
	const search = useSearch({ strict: false }) as {
		station?: string;
	};
	const stationToken = search.station;
	const playback = usePlaybackContext();
	const [trackIndex, setTrackIndex] = useState(0);
	const hasStartedRef = useRef(false);

	const playlistQuery = trpc.playback.getPlaylist.useQuery(
		{ stationToken: stationToken ?? "", quality: "high" },
		{ enabled: !!stationToken },
	);

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

	const items = playlistQuery.data ?? [];
	const currentTrack = items[trackIndex];

	// Auto-play first track when playlist loads
	useEffect(() => {
		if (currentTrack && !hasStartedRef.current) {
			const audioUrl =
				currentTrack.audioUrlMap?.highQuality?.audioUrl ??
				currentTrack.audioUrlMap?.mediumQuality?.audioUrl ??
				currentTrack.audioUrlMap?.lowQuality?.audioUrl;
			if (audioUrl) {
				playback.playTrack({
					trackToken: currentTrack.trackToken,
					songName: currentTrack.songName,
					artistName: currentTrack.artistName,
					albumName: currentTrack.albumName,
					audioUrl,
				});
				hasStartedRef.current = true;
			}
		}
	}, [currentTrack, playback]);

	// Set the current station token when playing from a station
	useEffect(() => {
		if (stationToken) {
			playback.setCurrentStationToken(stationToken);
		}
	}, [stationToken, playback]);

	const handleSkip = useCallback(() => {
		const nextIndex = trackIndex + 1;
		if (nextIndex < items.length) {
			setTrackIndex(nextIndex);
			const next = items[nextIndex];
			if (next) {
				const audioUrl =
					next.audioUrlMap?.highQuality?.audioUrl ??
					next.audioUrlMap?.mediumQuality?.audioUrl ??
					next.audioUrlMap?.lowQuality?.audioUrl;
				if (audioUrl) {
					playback.playTrack({
						trackToken: next.trackToken,
						songName: next.songName,
						artistName: next.artistName,
						albumName: next.albumName,
						audioUrl,
					});
				}
			}
		} else {
			// Refetch playlist for more tracks
			playlistQuery.refetch();
			setTrackIndex(0);
			hasStartedRef.current = false;
		}
	}, [trackIndex, items, playback, playlistQuery]);

	// Auto-advance to next track when current track ends
	useEffect(() => {
		playback.setOnTrackEnd(handleSkip);
		return () => {
			playback.setOnTrackEnd(null);
		};
	}, [playback, handleSkip]);

	const handleLike = useCallback(() => {
		if (!stationToken || !currentTrack) return;
		feedbackMutation.mutate({
			stationToken,
			trackToken: currentTrack.trackToken,
			isPositive: true,
		});
	}, [stationToken, currentTrack, feedbackMutation]);

	const handleDislike = useCallback(() => {
		if (!stationToken || !currentTrack) return;
		feedbackMutation.mutate({
			stationToken,
			trackToken: currentTrack.trackToken,
			isPositive: false,
		});
		handleSkip();
	}, [stationToken, currentTrack, feedbackMutation, handleSkip]);

	const handleSleep = useCallback(() => {
		if (!currentTrack) return;
		sleepMutation.mutate({ trackToken: currentTrack.trackToken });
		handleSkip();
	}, [currentTrack, sleepMutation, handleSkip]);

	const handleBookmark = useCallback(() => {
		if (!currentTrack) return;
		bookmarkSongMutation.mutate({
			trackToken: currentTrack.trackToken,
		});
	}, [currentTrack, bookmarkSongMutation]);

	if (!stationToken) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-zinc-500">
					Select a station to start listening
				</p>
			</div>
		);
	}

	if (playlistQuery.isLoading) {
		return <NowPlayingSkeleton />;
	}

	if (!currentTrack) {
		return (
			<div className="flex-1 flex items-center justify-center p-4">
				<p className="text-zinc-500">No tracks available</p>
			</div>
		);
	}

	const progressPercent =
		playback.duration > 0
			? (playback.progress / playback.duration) * 100
			: 0;

	return (
		<div className="flex-1 flex flex-col items-center justify-center p-8 space-y-6">
			{/* Album art placeholder */}
			<div className="w-64 h-64 md:w-80 md:h-80 bg-zinc-800 rounded-2xl shadow-2xl flex items-center justify-center relative">
				<Music className="w-20 h-20 text-zinc-600" />
				{playback.isPlaying && (
					<div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-cyan-500 rounded-full text-xs font-medium text-zinc-900">
						PLAYING
					</div>
				)}
			</div>

			{/* Track info */}
			<div className="text-center">
				<h2 className="text-2xl md:text-3xl font-bold text-zinc-100">
					{currentTrack.songName}
				</h2>
				<p className="text-lg text-zinc-400 mt-1">
					{currentTrack.artistName}
				</p>
				<p className="text-sm text-zinc-500">{currentTrack.albumName}</p>
			</div>

			{/* Progress bar */}
			<div className="w-full max-w-md">
				<div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
					<div
						className="h-full bg-cyan-500 transition-all duration-300"
						style={{ width: `${String(progressPercent)}%` }}
					/>
				</div>
				<div className="flex justify-between text-xs text-zinc-500 mt-1">
					<span>{formatTime(playback.progress)}</span>
					<span>{formatTime(playback.duration)}</span>
				</div>
			</div>

			{/* Primary controls */}
			<div className="flex items-center gap-6" role="group" aria-label="Playback controls">
				<Button
					variant="ghost"
					size="icon"
					className="text-red-500 hover:text-red-400 h-12 w-12"
					onClick={handleDislike}
					aria-label="Dislike this track"
				>
					<ThumbsDown className="w-6 h-6" />
				</Button>
				<Button
					size="icon"
					className="h-14 w-14 rounded-full bg-cyan-500 hover:bg-cyan-400 text-zinc-900"
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
				<Button
					variant="ghost"
					size="icon"
					className="text-green-500 hover:text-green-400 h-12 w-12"
					onClick={handleLike}
					aria-label="Like this track"
				>
					<ThumbsUp className="w-6 h-6" />
				</Button>
			</div>

			{/* Secondary actions */}
			<div className="flex items-center gap-4 text-zinc-500">
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
		</div>
	);
}
