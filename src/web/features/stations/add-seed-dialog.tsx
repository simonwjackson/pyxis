/**
 * @module AddSeedDialog
 * Dialog for searching and adding artist/song seeds to a radio station.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/web/shared/lib/trpc";
import { AddSeedDialogEmpty } from "./add-seed-dialog/AddSeedDialogEmpty";
import { AddSeedDialogFooter } from "./add-seed-dialog/AddSeedDialogFooter";
import { AddSeedDialogHeader } from "./add-seed-dialog/AddSeedDialogHeader";
import { AddSeedDialogPrompt } from "./add-seed-dialog/AddSeedDialogPrompt";
import { AddSeedDialogResults } from "./add-seed-dialog/AddSeedDialogResults";
import { AddSeedDialogSearching } from "./add-seed-dialog/AddSeedDialogSearching";
import type { AddSeedDialogProps } from "./add-seed-dialog/types";

/**
 * Modal dialog for adding new seeds (artists or songs) to a radio station.
 * Includes search with debounced input and results display.
 */
export function AddSeedDialog({ radioId, onClose }: AddSeedDialogProps) {
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const utils = trpc.useUtils();

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedQuery(query.trim());
		}, 300);
		return () => clearTimeout(timer);
	}, [query]);

	const searchQuery = trpc.search.search.useQuery(
		{ searchText: debouncedQuery },
		{ enabled: debouncedQuery.length > 0 },
	);

	const addMutation = trpc.radio.addSeed.useMutation({
		onSuccess(data) {
			utils.radio.getStation.invalidate({ id: radioId });
			const name = data.songName ?? data.artistName ?? "Seed";
			toast.success(`Added "${name}" as a seed`);
		},
		onError(error) {
			toast.error(`Failed to add seed: ${error.message}`);
		},
	});

	const handleAdd = (musicToken: string) => {
		addMutation.mutate({ radioId, musicToken });
	};

	const artists = searchQuery.data?.artists ?? [];
	const songs = searchQuery.data?.songs ?? [];
	const hasResults = artists.length > 0 || songs.length > 0;

	return (
		<div
			className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
			onClick={onClose}
			onKeyDown={(event) => {
				if (event.key === "Escape") onClose();
			}}
			role="dialog"
			aria-modal="true"
			aria-labelledby="add-seed-dialog-title"
		>
			<div
				className="bg-[var(--color-bg)] border border-[var(--color-border)] w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl"
				onClick={(event) => event.stopPropagation()}
				onKeyDown={() => {}}
			>
				<AddSeedDialogHeader
					inputRef={inputRef}
					query={query}
					onQueryChange={setQuery}
				/>

				<div className="flex-1 overflow-y-auto p-2">
					{searchQuery.isFetching ? (
						<AddSeedDialogSearching />
					) : hasResults ? (
						<AddSeedDialogResults
							artists={artists}
							songs={songs}
							isMutating={addMutation.isPending}
							onAdd={handleAdd}
						/>
					) : debouncedQuery.length > 0 ? (
						<AddSeedDialogEmpty query={debouncedQuery} />
					) : (
						<AddSeedDialogPrompt />
					)}
				</div>

				<AddSeedDialogFooter onClose={onClose} />
			</div>
		</div>
	);
}
