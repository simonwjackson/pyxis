/**
 * @module SonosSpeakerPicker
 * Distilled Sonos speaker picker — clean default view with expandable details.
 * Default: speaker list with cast/stop toggles only.
 * Expanded: volume slider and group actions per speaker.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Cast, Loader2, PauseCircle, PlayCircle, Volume2, Link2, Split, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "../lib/trpc";
import { Button } from "../ui/button";
import { cn } from "../lib/utils";

type SonosSpeakerPickerProps = {
	readonly currentTrackId: string | null;
};

type Speaker = {
	readonly uuid: string;
	readonly name: string;
	readonly groupId: string;
	readonly isCoordinator: boolean;
	readonly model: string;
	readonly playbackState: string | null;
	readonly volume: number | null;
	readonly isPyxisStream: boolean;
	readonly isActiveCastTarget: boolean;
};

export function SonosSpeakerPicker({ currentTrackId }: SonosSpeakerPickerProps) {
	const [open, setOpen] = useState(false);
	const [volumeDraft, setVolumeDraft] = useState<Record<string, number>>({});
	const [expandedSpeaker, setExpandedSpeaker] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const utils = trpc.useUtils();

	const speakersQuery = trpc.sonos.speakers.list.useQuery(undefined, {
		refetchInterval: 15_000,
		staleTime: 5_000,
	});

	const speakers: Speaker[] = speakersQuery.data ?? [];
	const activeCount = speakers.filter((s) => s.isPyxisStream).length;

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: MouseEvent) => {
			if (!containerRef.current) return;
			if (containerRef.current.contains(event.target as Node)) return;
			setOpen(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		return () => document.removeEventListener("mousedown", onPointerDown);
	}, [open]);

	useEffect(() => {
		if (!speakers.length) return;
		setVolumeDraft((prev) => {
			const next = { ...prev };
			for (const speaker of speakers) {
				if (next[speaker.uuid] != null) continue;
				next[speaker.uuid] = speaker.volume ?? 0;
			}
			return next;
		});
	}, [speakers]);

	const playToMutation = trpc.sonos.playTo.useMutation({
		onSuccess: async () => { await utils.sonos.speakers.list.invalidate(); },
		onError: (error) => { toast.error(`cast failed: ${error.message}`); },
	});

	const stopMutation = trpc.sonos.stop.useMutation({
		onSuccess: async () => { await utils.sonos.speakers.list.invalidate(); },
		onError: (error) => { toast.error(`stop failed: ${error.message}`); },
	});

	const setVolumeMutation = trpc.sonos.volume.set.useMutation({
		onSuccess: async () => { await utils.sonos.speakers.list.invalidate(); },
		onError: (error) => { toast.error(`volume update failed: ${error.message}`); },
	});

	const groupJoinMutation = trpc.sonos.group.join.useMutation({
		onError: (error) => { toast.error(`group join failed: ${error.message}`); },
	});

	const groupLeaveMutation = trpc.sonos.group.leave.useMutation({
		onError: (error) => { toast.error(`group leave failed: ${error.message}`); },
	});

	const handleTogglePlayback = (speaker: Speaker) => {
		if (speaker.isPyxisStream) {
			stopMutation.mutate({ speakerUuids: [speaker.uuid] });
			return;
		}
		if (!currentTrackId) {
			toast.error("no active track to cast");
			return;
		}
		playToMutation.mutate({
			speakerUuids: [speaker.uuid],
			trackId: currentTrackId,
		});
	};

	const commitVolume = (speakerUuid: string) => {
		const value = volumeDraft[speakerUuid];
		if (value == null) return;
		setVolumeMutation.mutate({ speakerUuid, volume: value });
	};

	const busy = playToMutation.isPending
		|| stopMutation.isPending
		|| setVolumeMutation.isPending
		|| groupJoinMutation.isPending
		|| groupLeaveMutation.isPending;

	return (
		<div className="relative" ref={containerRef}>
			<Button
				variant="ghost"
				size="icon"
				className="relative h-8 w-8"
				onClick={() => setOpen((prev) => !prev)}
				aria-label="Sonos speakers"
				title="Sonos speakers"
			>
				<Cast className="w-4 h-4" />
				{activeCount > 0 && (
					<span className="absolute -top-1 -right-1 min-w-4 h-4 bg-[var(--color-primary)] text-white text-[10px] leading-4 px-1 text-center">
						{activeCount}
					</span>
				)}
			</Button>

			{open && (
				<div className="absolute bottom-12 right-0 z-50 w-[min(22rem,calc(100vw-1rem))] max-h-[60vh] overflow-y-auto border border-[var(--color-border)] bg-[var(--color-bg-panel)] shadow-2xl">
					{/* Header */}
					<div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
						<p className="zune-heading text-base text-[var(--color-text)]">speakers</p>
						<button
							type="button"
							className="zune-label text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
							onClick={() => speakersQuery.refetch()}
						>
							refresh
						</button>
					</div>

					{speakersQuery.isLoading && (
						<div className="py-8 flex items-center justify-center text-[var(--color-text-muted)]">
							<Loader2 className="w-4 h-4 animate-spin mr-2" />
							<span className="text-sm font-light">scanning network...</span>
						</div>
					)}

					{!speakersQuery.isLoading && speakers.length === 0 && (
						<p className="py-8 text-sm text-center text-[var(--color-text-dim)] font-light">
							no speakers found
						</p>
					)}

					{/* Speaker list — clean, one action per row */}
					<div className="divide-y divide-[var(--color-border)]">
						{speakers.map((speaker) => {
							const isExpanded = expandedSpeaker === speaker.uuid;
							const draftVolume = volumeDraft[speaker.uuid] ?? speaker.volume ?? 0;

							return (
								<div
									key={speaker.uuid}
									className={cn(
										"transition-colors",
										speaker.isPyxisStream
											? "bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
											: "",
									)}
								>
									{/* Primary row: name + cast/stop */}
									<div className="flex items-center gap-3 px-4 py-3">
										<button
											type="button"
											onClick={() => setExpandedSpeaker(isExpanded ? null : speaker.uuid)}
											className="text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors shrink-0"
											aria-label={isExpanded ? "Collapse" : "Expand"}
										>
											{isExpanded ? (
												<ChevronDown className="w-3.5 h-3.5" />
											) : (
												<ChevronRight className="w-3.5 h-3.5" />
											)}
										</button>
										<div className="flex-1 min-w-0">
											<p className="text-sm text-[var(--color-text)] truncate">
												{speaker.name}
											</p>
											<p className="text-xs text-[var(--color-text-dim)]">
												{speaker.model}
											</p>
										</div>
										<Button
											variant={speaker.isPyxisStream ? "outline" : "default"}
											size="sm"
											className="shrink-0"
											disabled={busy}
											onClick={() => handleTogglePlayback(speaker)}
										>
											{speaker.isPyxisStream ? "stop" : "cast"}
										</Button>
									</div>

									{/* Expanded: volume + group actions */}
									{isExpanded && (
										<div className="px-4 pb-3 pl-11 space-y-3">
											{/* Volume */}
											<div className="flex items-center gap-2">
												<Volume2 className="w-3.5 h-3.5 text-[var(--color-text-dim)] shrink-0" />
												<input
													type="range"
													min={0}
													max={100}
													step={1}
													value={draftVolume}
													onChange={(e) => {
														setVolumeDraft((prev) => ({
															...prev,
															[speaker.uuid]: Number.parseInt(e.target.value, 10),
														}));
													}}
													onMouseUp={() => commitVolume(speaker.uuid)}
													onTouchEnd={() => commitVolume(speaker.uuid)}
													className="w-full accent-[var(--color-primary)]"
													aria-label={`Volume for ${speaker.name}`}
												/>
												<span className="zune-data w-7 text-right text-xs text-[var(--color-text-muted)]">
													{draftVolume}
												</span>
											</div>

											{/* Group actions */}
											<div className="flex gap-1.5">
												{!speaker.isCoordinator && (
													<Button
														size="sm"
														variant="outline"
														disabled={groupLeaveMutation.isPending}
														onClick={() => {
															groupLeaveMutation.mutateAsync({ speakerUuid: speaker.uuid })
																.then(() => utils.sonos.speakers.list.invalidate())
																.catch(() => {});
														}}
													>
														<Split className="w-3 h-3 mr-1" />
														ungroup
													</Button>
												)}
											</div>
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
