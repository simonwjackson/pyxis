import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, User, Music, ThumbsUp, ThumbsDown } from "lucide-react";
import { trpc } from "../lib/trpc";
import { Skeleton } from "../components/ui/skeleton";
import type { StationSeed, StationFeedback } from "../../types/api";

type StationDetailsPageProps = {
	readonly stationToken: string;
};

function SeedItem({
	seed,
	type,
}: {
	readonly seed: StationSeed;
	readonly type: "artist" | "song";
}) {
	return (
		<div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50">
			<div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
				{type === "artist" ? (
					<User className="w-4 h-4 text-zinc-400" />
				) : (
					<Music className="w-4 h-4 text-zinc-400" />
				)}
			</div>
			<div className="min-w-0">
				<p className="text-sm text-zinc-300 truncate">
					{type === "song" ? seed.songName : seed.artistName}
				</p>
				{type === "song" && seed.artistName && (
					<p className="text-xs text-zinc-500 truncate">
						{seed.artistName}
					</p>
				)}
			</div>
		</div>
	);
}

function FeedbackItem({
	feedback,
}: {
	readonly feedback: StationFeedback;
}) {
	return (
		<div className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/30">
			<p className="text-sm text-zinc-300 flex-1 truncate">
				{feedback.songName}
			</p>
			<p className="text-xs text-zinc-500 shrink-0">
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

export function StationDetailsPage({ stationToken }: StationDetailsPageProps) {
	const navigate = useNavigate();
	const stationQuery = trpc.stations.getStation.useQuery({ stationToken });

	if (stationQuery.isLoading) {
		return <DetailsSkeleton />;
	}

	if (stationQuery.error) {
		return (
			<div className="flex-1 p-4">
				<p className="text-red-400">
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
				<p className="text-zinc-500">Station not found.</p>
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
					onClick={() => navigate({ to: "/" })}
					className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
					aria-label="Back to stations"
				>
					<ChevronLeft className="w-5 h-5 text-zinc-400" />
				</button>
				<div>
					<h2 className="text-lg font-semibold text-zinc-100">
						{station.stationName}
					</h2>
					<p className="text-sm text-zinc-500">Station details</p>
				</div>
			</div>

			<div>
				<h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-3">
					Seeds
				</h3>

				{!hasSeeds && (
					<p className="py-6 text-center text-zinc-500 text-sm">
						No seeds found for this station.
					</p>
				)}

				{artistSeeds.length > 0 && (
					<div className="space-y-1 mb-4">
						<p className="text-xs text-zinc-500 mb-1">Artists</p>
						{artistSeeds.map((seed) => (
							<SeedItem
								key={seed.seedId}
								seed={seed}
								type="artist"
							/>
						))}
					</div>
				)}

				{songSeeds.length > 0 && (
					<div className="space-y-1">
						<p className="text-xs text-zinc-500 mb-1">Songs</p>
						{songSeeds.map((seed) => (
							<SeedItem
								key={seed.seedId}
								seed={seed}
								type="song"
							/>
						))}
					</div>
				)}
			</div>

			<div>
				<h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-3">
					Feedback
				</h3>

				{!hasFeedback && (
					<p className="py-6 text-center text-zinc-500 text-sm">
						No feedback for this station yet.
					</p>
				)}

				{thumbsUp.length > 0 && (
					<div className="mb-4">
						<p className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
							<ThumbsUp className="w-3 h-3 text-green-500" />
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
						<p className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
							<ThumbsDown className="w-3 h-3 text-red-500" />
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
		</div>
	);
}
