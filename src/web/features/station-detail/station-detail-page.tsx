import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
	ChevronLeft,
	User,
	Music,
	ThumbsUp,
	ThumbsDown,
	Plus,
	X,
	Play,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import { Skeleton } from "@/web/shared/ui/skeleton";
import { Button } from "@/web/shared/ui/button";
import { AddSeedDialog } from "@/web/features/stations/add-seed-dialog";
import { usePlaybackContext } from "@/web/shared/playback/playback-context";
import {
	radioTrackToNowPlaying,
	tracksToQueuePayload,
} from "@/web/shared/lib/now-playing-utils";
import type { NowPlayingTrack } from "@/web/shared/lib/now-playing-utils";

type StationSeed = {
	readonly seedId: string;
	readonly musicToken?: string;
	readonly songName?: string;
	readonly artistName?: string;
};

type StationFeedback = {
	readonly feedbackId: string;
	readonly songName: string;
	readonly artistName: string;
};

function SeedItem({
	seed,
	type,
	onRemove,
	isRemoving,
}: {
	readonly seed: StationSeed;
	readonly type: "artist" | "song";
	readonly onRemove: (seedId: string) => void;
	readonly isRemoving: boolean;
}) {
	return (
		<div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-highlight)] group">
			<div className="w-8 h-8 rounded-full bg-[var(--color-bg-highlight)] flex items-center justify-center shrink-0">
				{type === "artist" ? (
					<User className="w-4 h-4 text-[var(--color-text-muted)]" />
				) : (
					<Music className="w-4 h-4 text-[var(--color-text-muted)]" />
				)}
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm text-[var(--color-text-muted)] truncate">
					{type === "song" ? seed.songName : seed.artistName}
				</p>
				{type === "song" && seed.artistName && (
					<p className="text-xs text-[var(--color-text-dim)] truncate">
						{seed.artistName}
					</p>
				)}
			</div>
			<button
				type="button"
				onClick={() => onRemove(seed.seedId)}
				disabled={isRemoving}
				className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--color-text-dim)] hover:text-[var(--color-error)] hover:bg-[var(--color-bg-highlight)] rounded transition-all disabled:opacity-50"
				title="Remove seed"
			>
				<X className="w-4 h-4" />
			</button>
		</div>
	);
}

function FeedbackItem({
	feedback,
}: {
	readonly feedback: StationFeedback;
}) {
	return (
		<div className="flex items-center gap-3 p-2 rounded-lg bg-[var(--color-bg-highlight)]">
			<p className="text-sm text-[var(--color-text-muted)] flex-1 truncate">
				{feedback.songName}
			</p>
			<p className="text-xs text-[var(--color-text-dim)] shrink-0">
				{feedback.artistName}
			</p>
		</div>
	);
}

function DetailsSkeleton() {
	return (
		<div className="flex-1 p-4 space-y-6 max-w-2xl">
			<div className="flex items-center gap-3">
				<Skeleton className="w-9 h-9 rounded-lg" />
				<div>
					<Skeleton className="h-6 w-48 mb-1" />
					<Skeleton className="h-4 w-24" />
				</div>
			</div>
			<div>
				<Skeleton className="h-4 w-16 mb-3" />
				<div className="space-y-1">
					{Array.from({ length: 3 }).map((_, i) => (
						<Skeleton key={i} className="h-12 w-full rounded-lg" />
					))}
				</div>
			</div>
			<div>
				<Skeleton className="h-4 w-20 mb-3" />
				<div className="space-y-1">
					{Array.from({ length: 4 }).map((_, i) => (
						<Skeleton key={i} className="h-9 w-full rounded-lg" />
					))}
				</div>
			</div>
		</div>
	);
}

export function StationDetailPage({
	token,
	autoPlay,
}: {
	readonly token: string;
	readonly autoPlay?: boolean;
}) {
	const [showAddSeed, setShowAddSeed] = useState(false);
	const navigate = useNavigate();
	const playback = usePlaybackContext();
	const playbackRef = useRef(playback);
	playbackRef.current = playback;
	const stationQuery = trpc.radio.getStation.useQuery({ id: token });
	const utils = trpc.useUtils();

	// Radio playback state
	const [isActiveContext, setIsActiveContext] = useState(false);
	const [nowPlayingTracks, setNowPlayingTracks] = useState<
		readonly NowPlayingTrack[]
	>([]);
	const hasAutoPlayedRef = useRef(false);

	const currentTrackId = playback.currentTrack?.trackToken;
	const activeTrackIds = nowPlayingTracks.map((t) => t.id);
	const isThisStationPlaying =
		isActiveContext && activeTrackIds.includes(currentTrackId ?? "");

	const radioQuery = trpc.radio.getTracks.useQuery(
		{ id: token, quality: "high" },
		{ enabled: false },
	);

	const startRadioPlayback = useCallback(() => {
		radioQuery.refetch().then((result) => {
			if (!result.data) return;
			const newTracks = result.data.map(radioTrackToNowPlaying);
			setNowPlayingTracks(newTracks);
			setIsActiveContext(true);
			playbackRef.current.setCurrentStationToken(token);
			playbackRef.current.playMutation.mutate({
				tracks: tracksToQueuePayload(newTracks),
				context: { type: "radio", seedId: token },
				startIndex: 0,
			});
		});
	}, [radioQuery, token]);

	// Auto-play on mount
	useEffect(() => {
		if (!autoPlay || hasAutoPlayedRef.current) return;
		hasAutoPlayedRef.current = true;
		startRadioPlayback();
	}, [autoPlay, startRadioPlayback]);

	useEffect(() => {
		if (playback.error) {
			toast.error(`Audio error: ${playback.error}`);
			playbackRef.current.clearError();
		}
	}, [playback.error]);

	const removeSeedMutation = trpc.radio.removeSeed.useMutation({
		onSuccess() {
			utils.radio.getStation.invalidate({ id: token });
			toast.success("Seed removed");
		},
		onError(err) {
			toast.error(`Failed to remove seed: ${err.message}`);
		},
	});

	const handleRemoveSeed = (seedId: string) => {
		removeSeedMutation.mutate({ radioId: token, seedId });
	};

	if (stationQuery.isLoading) {
		return <DetailsSkeleton />;
	}

	if (stationQuery.error) {
		return (
			<div className="flex-1 p-4">
				<p className="text-[var(--color-error)]">
					Failed to load station details:{" "}
					{stationQuery.error.message}
				</p>
			</div>
		);
	}

	const station = stationQuery.data;
	if (!station) {
		return (
			<div className="flex-1 p-4">
				<p className="text-[var(--color-text-dim)]">Station not found.</p>
			</div>
		);
	}

	const artistSeeds = station.music?.artists ?? [];
	const songSeeds = station.music?.songs ?? [];
	const thumbsUp = station.feedback?.thumbsUp ?? [];
	const thumbsDown = station.feedback?.thumbsDown ?? [];
	const hasSeeds = artistSeeds.length > 0 || songSeeds.length > 0;
	const hasFeedback = thumbsUp.length > 0 || thumbsDown.length > 0;

	return (
		<div className="flex-1 p-4 space-y-6 max-w-2xl">
			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={() => navigate({ to: "/", search: { pl_sort: undefined, pl_page: undefined, al_sort: undefined, al_page: undefined } })}
					className="p-2 hover:bg-[var(--color-bg-highlight)] rounded-lg transition-colors"
					aria-label="Back to stations"
				>
					<ChevronLeft className="w-5 h-5 text-[var(--color-text-muted)]" />
				</button>
				<div className="flex-1">
					<h2 className="text-lg font-semibold text-[var(--color-text)]">
						{station.name}
					</h2>
					<p className="text-sm text-[var(--color-text-dim)]">
						Station details
					</p>
				</div>
				{!isThisStationPlaying && (
					<Button
						onClick={startRadioPlayback}
						className="gap-2 rounded-full bg-[var(--color-primary)] hover:brightness-110 text-[var(--color-bg)]"
					>
						<Play className="w-4 h-4" fill="currentColor" />
						Play
					</Button>
				)}
			</div>

			<div>
				<div className="flex items-center justify-between mb-3">
					<h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
						Seeds
					</h3>
					<button
						type="button"
						onClick={() => setShowAddSeed(true)}
						className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--color-primary)] hover:bg-[var(--color-bg-highlight)] rounded-lg transition-colors"
					>
						<Plus className="w-4 h-4" />
						Add Seed
					</button>
				</div>

				{!hasSeeds && (
					<p className="py-6 text-center text-[var(--color-text-dim)] text-sm">
						No seeds found for this station.
					</p>
				)}

				{artistSeeds.length > 0 && (
					<div className="space-y-1 mb-4">
						<p className="text-xs text-[var(--color-text-dim)] mb-1">
							Artists
						</p>
						{artistSeeds.map((seed) => (
							<SeedItem
								key={seed.seedId}
								seed={seed}
								type="artist"
								onRemove={handleRemoveSeed}
								isRemoving={removeSeedMutation.isPending}
							/>
						))}
					</div>
				)}

				{songSeeds.length > 0 && (
					<div className="space-y-1">
						<p className="text-xs text-[var(--color-text-dim)] mb-1">
							Songs
						</p>
						{songSeeds.map((seed) => (
							<SeedItem
								key={seed.seedId}
								seed={seed}
								type="song"
								onRemove={handleRemoveSeed}
								isRemoving={removeSeedMutation.isPending}
							/>
						))}
					</div>
				)}
			</div>

			<div>
				<h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide mb-3">
					Feedback
				</h3>

				{!hasFeedback && (
					<p className="py-6 text-center text-[var(--color-text-dim)] text-sm">
						No feedback for this station yet.
					</p>
				)}

				{thumbsUp.length > 0 && (
					<div className="mb-4">
						<p className="text-xs text-[var(--color-text-dim)] mb-1 flex items-center gap-1">
							<ThumbsUp className="w-3 h-3 text-[var(--color-liked)]" />
							Liked
						</p>
						<div className="space-y-1">
							{thumbsUp.map((fb) => (
								<FeedbackItem
									key={fb.feedbackId}
									feedback={fb}
								/>
							))}
						</div>
					</div>
				)}

				{thumbsDown.length > 0 && (
					<div>
						<p className="text-xs text-[var(--color-text-dim)] mb-1 flex items-center gap-1">
							<ThumbsDown className="w-3 h-3 text-[var(--color-error)]" />
							Disliked
						</p>
						<div className="space-y-1">
							{thumbsDown.map((fb) => (
								<FeedbackItem
									key={fb.feedbackId}
									feedback={fb}
								/>
							))}
						</div>
					</div>
				)}
			</div>

			{showAddSeed && (
				<AddSeedDialog
					radioId={token}
					onClose={() => setShowAddSeed(false)}
				/>
			)}
		</div>
	);
}
