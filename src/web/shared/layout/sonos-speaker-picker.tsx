import { useEffect, useMemo, useRef, useState } from "react";
import { Cast, Loader2, PauseCircle, PlayCircle, Volume2, Link2, Split } from "lucide-react";
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

function shortGroupId(groupId: string): string {
	return groupId.length <= 8 ? groupId : groupId.slice(0, 8);
}

export function SonosSpeakerPicker({ currentTrackId }: SonosSpeakerPickerProps) {
	const [open, setOpen] = useState(false);
	const [volumeDraft, setVolumeDraft] = useState<Record<string, number>>({});
	const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());
	const containerRef = useRef<HTMLDivElement>(null);
	const utils = trpc.useUtils();

	const speakersQuery = trpc.sonos.speakers.list.useQuery(undefined, {
		refetchInterval: 15_000,
		staleTime: 5_000,
	});

	const speakers: Speaker[] = speakersQuery.data ?? [];
	const activeCount = speakers.filter((speaker) => speaker.isPyxisStream).length;

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: MouseEvent) => {
			if (!containerRef.current) return;
			if (containerRef.current.contains(event.target as Node)) return;
			setOpen(false);
		};
		document.addEventListener("mousedown", onPointerDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
		};
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

	useEffect(() => {
		setSelectedUuids((prev) => {
			const known = new Set(speakers.map((speaker) => speaker.uuid));
			const next = new Set<string>();
			for (const uuid of prev) {
				if (known.has(uuid)) next.add(uuid);
			}
			for (const speaker of speakers) {
				if (speaker.isActiveCastTarget) next.add(speaker.uuid);
			}
			return next;
		});
	}, [speakers]);

	const groupedSpeakers = useMemo(() => {
		const groups = new Map<string, Speaker[]>();
		for (const speaker of speakers) {
			const existing = groups.get(speaker.groupId);
			if (existing) {
				existing.push(speaker);
			} else {
				groups.set(speaker.groupId, [speaker]);
			}
		}
		return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
	}, [speakers]);

	const playToMutation = trpc.sonos.playTo.useMutation({
		onSuccess: async () => {
			await utils.sonos.speakers.list.invalidate();
		},
		onError: (error) => {
			toast.error(`Cast failed: ${error.message}`);
		},
	});

	const stopMutation = trpc.sonos.stop.useMutation({
		onSuccess: async () => {
			await utils.sonos.speakers.list.invalidate();
		},
		onError: (error) => {
			toast.error(`Stop failed: ${error.message}`);
		},
	});

	const setVolumeMutation = trpc.sonos.volume.set.useMutation({
		onSuccess: async () => {
			await utils.sonos.speakers.list.invalidate();
		},
		onError: (error) => {
			toast.error(`Volume update failed: ${error.message}`);
		},
	});

	const groupJoinMutation = trpc.sonos.group.join.useMutation({
		onError: (error) => {
			toast.error(`Group join failed: ${error.message}`);
		},
	});

	const groupLeaveMutation = trpc.sonos.group.leave.useMutation({
		onError: (error) => {
			toast.error(`Group leave failed: ${error.message}`);
		},
	});

	const handleTogglePlayback = (speaker: Speaker) => {
		if (speaker.isPyxisStream) {
			setSelectedUuids((prev) => {
				const next = new Set(prev);
				next.delete(speaker.uuid);
				return next;
			});
			stopMutation.mutate({ speakerUuids: [speaker.uuid] });
			return;
		}
		if (!currentTrackId) {
			toast.error("No active track to cast");
			return;
		}
		setSelectedUuids((prev) => new Set([...prev, speaker.uuid]));
		playToMutation.mutate({
			speakerUuids: [speaker.uuid],
			trackId: currentTrackId,
		});
	};

	const handleToggleSelected = (speaker: Speaker, shouldSelect: boolean) => {
		if (shouldSelect) {
			if (!speaker.isPyxisStream && !currentTrackId) {
				toast.error("No active track to cast");
				return;
			}
			setSelectedUuids((prev) => new Set([...prev, speaker.uuid]));
			if (!speaker.isPyxisStream) {
				playToMutation.mutate({
					speakerUuids: [speaker.uuid],
					trackId: currentTrackId ?? undefined,
				});
			}
			return;
		}

		setSelectedUuids((prev) => {
			const next = new Set(prev);
			next.delete(speaker.uuid);
			return next;
		});
		if (speaker.isPyxisStream || speaker.isActiveCastTarget) {
			stopMutation.mutate({ speakerUuids: [speaker.uuid] });
		}
	};

	const commitVolume = (speakerUuid: string) => {
		const value = volumeDraft[speakerUuid];
		if (value == null) return;
		setVolumeMutation.mutate({ speakerUuid, volume: value });
	};

	const selectedSpeakers = useMemo(
		() => speakers.filter((speaker) => selectedUuids.has(speaker.uuid)),
		[speakers, selectedUuids],
	);

	const handleCastSelected = () => {
		if (!selectedSpeakers.length) return;
		if (!currentTrackId) {
			toast.error("No active track to cast");
			return;
		}
		playToMutation.mutate({
			speakerUuids: selectedSpeakers.map((speaker) => speaker.uuid),
			trackId: currentTrackId,
		});
	};

	const handleStopSelected = () => {
		if (!selectedSpeakers.length) return;
		stopMutation.mutate({
			speakerUuids: selectedSpeakers.map((speaker) => speaker.uuid),
		});
		setSelectedUuids(new Set());
	};

	const handleGroupSelected = async () => {
		if (selectedSpeakers.length < 2) {
			toast.error("Select at least 2 speakers to create a group");
			return;
		}
		const coordinator =
			selectedSpeakers.find((speaker) => speaker.isCoordinator) ?? selectedSpeakers[0];
		if (!coordinator) return;
		try {
			const members = selectedSpeakers.filter((speaker) => speaker.uuid !== coordinator.uuid);
			await Promise.all(
				members.map((speaker) =>
					groupJoinMutation.mutateAsync({
						speakerUuid: speaker.uuid,
						coordinatorUuid: coordinator.uuid,
					}),
				),
			);
			await utils.sonos.speakers.list.invalidate();
		} catch {
			// handled by mutation onError
		}
	};

	const handleUngroupSelected = async () => {
		if (!selectedSpeakers.length) return;
		try {
			await Promise.all(
				selectedSpeakers.map((speaker) =>
					groupLeaveMutation.mutateAsync({ speakerUuid: speaker.uuid }),
				),
			);
			await utils.sonos.speakers.list.invalidate();
		} catch {
			// handled by mutation onError
		}
	};

	return (
		<div className="relative" ref={containerRef}>
			<Button
				variant="ghost"
				size="icon"
				className="relative h-8 w-8 rounded-full"
				onClick={() => setOpen((prev) => !prev)}
				aria-label="Sonos speakers"
				title="Sonos speakers"
			>
				<Cast className="w-4 h-4" />
				{activeCount > 0 && (
					<span className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-[var(--color-primary)] text-white text-[10px] leading-4 px-1 text-center">
						{activeCount}
					</span>
				)}
			</Button>

			{open && (
				<div className="absolute bottom-12 right-0 z-50 w-[min(24rem,calc(100vw-1rem))] max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-3 shadow-2xl">
					<div className="flex items-center justify-between mb-2">
						<p className="text-sm font-semibold text-[var(--color-text)]">Sonos Speakers</p>
						<button
							type="button"
							className="text-xs text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
							onClick={() => speakersQuery.refetch()}
						>
							Refresh
						</button>
					</div>

					{speakersQuery.isLoading && (
						<div className="py-6 flex items-center justify-center text-[var(--color-text-muted)]">
							<Loader2 className="w-4 h-4 animate-spin mr-2" />
							Scanning network...
						</div>
					)}

					{!speakersQuery.isLoading && groupedSpeakers.length === 0 && (
						<p className="py-6 text-sm text-center text-[var(--color-text-muted)]">
							No Sonos speakers found on network
						</p>
					)}

					{selectedSpeakers.length > 0 && (
						<div className="mb-3 rounded-lg border border-[var(--color-border)] p-2 bg-[var(--color-bg)]">
							<p className="text-xs text-[var(--color-text-muted)] mb-2">
								{selectedSpeakers.length} selected
							</p>
							<div className="flex flex-wrap gap-1.5">
								<Button
									size="sm"
									variant="default"
									disabled={playToMutation.isPending}
									onClick={handleCastSelected}
								>
									Cast Selected
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={stopMutation.isPending}
									onClick={handleStopSelected}
								>
									Stop Selected
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={groupJoinMutation.isPending}
									onClick={() => {
										void handleGroupSelected();
									}}
								>
									<Link2 className="w-3.5 h-3.5 mr-1" />
									Group
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={groupLeaveMutation.isPending}
									onClick={() => {
										void handleUngroupSelected();
									}}
								>
									<Split className="w-3.5 h-3.5 mr-1" />
									Ungroup
								</Button>
							</div>
						</div>
					)}

					<div className="space-y-3">
						{groupedSpeakers.map(([groupId, group]) => {
							const coordinator = group.find((speaker) => speaker.isCoordinator);
							return (
								<div key={groupId} className="rounded-lg border border-[var(--color-border)] p-2">
									<p className="text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] mb-2">
										Group {shortGroupId(groupId)}
										{coordinator ? ` · ${coordinator.name} lead` : ""}
									</p>
									<div className="space-y-2">
										{group.map((speaker) => {
											const draftVolume = volumeDraft[speaker.uuid] ?? speaker.volume ?? 0;
											const busy = playToMutation.isPending
												|| stopMutation.isPending
												|| setVolumeMutation.isPending
												|| groupJoinMutation.isPending
												|| groupLeaveMutation.isPending;
											const isSelected = selectedUuids.has(speaker.uuid);
											return (
												<div
													key={speaker.uuid}
													className={cn(
														"rounded-md p-2 transition-colors",
														speaker.isPyxisStream
															? "bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)]"
															: "bg-[var(--color-bg)]",
													)}
												>
													<div className="flex items-center justify-between gap-2">
														<div className="flex items-start gap-2 min-w-0">
															<input
																type="checkbox"
																checked={isSelected}
																onChange={(event) => {
																	handleToggleSelected(
																		speaker,
																		event.target.checked,
																	);
																}}
																className="mt-1 accent-[var(--color-primary)]"
																aria-label={`Select ${speaker.name}`}
															/>
															<div className="min-w-0">
															<p className="text-sm font-medium text-[var(--color-text)] truncate">
																{speaker.name}
															</p>
															<p className="text-xs text-[var(--color-text-muted)] truncate">
																{speaker.model}
																{speaker.playbackState ? ` · ${speaker.playbackState}` : ""}
															</p>
															</div>
														</div>
														<Button
															variant={speaker.isPyxisStream ? "outline" : "default"}
															size="sm"
															className="shrink-0"
															disabled={busy}
															onClick={() => handleTogglePlayback(speaker)}
														>
															{speaker.isPyxisStream ? (
																<>
																	<PauseCircle className="w-3.5 h-3.5 mr-1" />
																	Stop
																</>
															) : (
																<>
																	<PlayCircle className="w-3.5 h-3.5 mr-1" />
																	Cast
																</>
															)}
														</Button>
													</div>
													<div className="mt-2 flex items-center gap-2">
														<Volume2 className="w-3.5 h-3.5 text-[var(--color-text-dim)]" />
														<input
															type="range"
															min={0}
															max={100}
															step={1}
															value={draftVolume}
															onChange={(event) => {
																setVolumeDraft((prev) => ({
																	...prev,
																	[speaker.uuid]: Number.parseInt(event.target.value, 10),
																}));
															}}
															onMouseUp={() => commitVolume(speaker.uuid)}
															onTouchEnd={() => commitVolume(speaker.uuid)}
															className="w-full accent-[var(--color-primary)]"
															aria-label={`Set volume for ${speaker.name}`}
														/>
														<span className="w-8 text-right text-xs text-[var(--color-text-muted)]">
															{draftVolume}
														</span>
													</div>
												</div>
											);
										})}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
