/**
 * @module AddSeedDialog
 * Dialog for searching and adding artist/song seeds to a radio station.
 *
 * The search query is bound to an Effect RPC atom over `search.pandora`
 * (rebuilt when the debounced query changes), and the seed mutation goes
 * through an Effect RPC mutation atom over `radio.seed.add`. The mutation
 * publishes the per-station reactivity tag from {@link radioStationTag} so
 * a future station-detail atom will refetch its seeds the same way the
 * legacy code invalidated `radio.getStation` for the same `radioId`.
 */

import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ApiPublicError } from "../../../api/contracts/common.js";
import type { ApiPandoraSearchResponse } from "../../../api/contracts/search.js";
import { AddSeedDialogEmpty } from "./AddSeedDialog/AddSeedDialogEmpty";
import { AddSeedDialogFooter } from "./AddSeedDialog/AddSeedDialogFooter";
import { AddSeedDialogHeader } from "./AddSeedDialog/AddSeedDialogHeader";
import { AddSeedDialogPrompt } from "./AddSeedDialog/AddSeedDialogPrompt";
import { AddSeedDialogResults } from "./AddSeedDialog/AddSeedDialogResults";
import { AddSeedDialogSearching } from "./AddSeedDialog/AddSeedDialogSearching";
import type { AddSeedDialogProps } from "./AddSeedDialog/types";
import { AddSeedDialogState } from "./AddSeedDialogState";
import { radioStationTag } from "./radioReactivityTags";
import { StationCommandState } from "./StationCommandState";

const addSeedMutationAtom = PyxisRpcClient.mutation("radio.seed.add");

/**
 * Stable "no query entered" atom used when the debounced query is empty so
 * the {@link useAtomValue} hook count stays stable across renders while
 * avoiding a real `search.pandora` request for an empty payload.
 */
const idleSearchAtom = Atom.make<
  AsyncResult.AsyncResult<ApiPandoraSearchResponse, ApiPublicError>
>(() => AsyncResult.initial(false));

/**
 * Modal dialog for adding new seeds (artists or songs) to a radio station.
 * Includes search with debounced input and results display.
 */
export function AddSeedDialog({ radioId, onClose }: AddSeedDialogProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const searchAtom = useMemo(
    () =>
      debouncedQuery.length > 0
        ? PyxisRpcClient.query("search.pandora.run", {
            searchText: debouncedQuery,
          })
        : idleSearchAtom,
    [debouncedQuery],
  );

  const searchResult = useAtomValue(searchAtom);
  const projected = projectQueryResult(searchResult);
  const state = AddSeedDialogState.fromResult(debouncedQuery, projected);

  const mutationResult = projectQueryResult(useAtomValue(addSeedMutationAtom));
  const commandState = StationCommandState.fromResult(mutationResult);
  const submit = useAtomSet(addSeedMutationAtom, { mode: "promiseExit" });
  const isMutating = StationCommandState.isSubmitting(commandState);

  const handleAdd = (musicToken: string) => {
    void submit({
      payload: { radioId, musicToken },
      reactivityKeys: [radioStationTag(radioId)],
    }).then((exit) => {
      if (exit._tag === "Success") {
        toast.success(`Added "${seedToastName(exit.value)}" as a seed`);
      } else {
        toast.error("Failed to add seed");
      }
    });
  };

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
      {/* biome-ignore lint/a11y/noStaticElementInteractions: dialog content stops backdrop click/keydown propagation; outer div carries the dialog role. */}
      <div
        className="bg-pyxis-bg border border-pyxis-border w-full max-w-md max-h-[70dvh] flex flex-col shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={() => {}}
      >
        <AddSeedDialogHeader
          inputRef={inputRef}
          query={query}
          onQueryChange={setQuery}
        />

        <div className="flex-1 overflow-y-auto p-2">
          <AddSeedDialogBody
            state={state}
            isMutating={isMutating}
            onAdd={handleAdd}
          />
        </div>

        <AddSeedDialogFooter onClose={onClose} />
      </div>
    </div>
  );
}

function AddSeedDialogBody({
  state,
  isMutating,
  onAdd,
}: {
  readonly state: AddSeedDialogState;
  readonly isMutating: boolean;
  readonly onAdd: (musicToken: string) => void;
}) {
  switch (state._tag) {
    case "Prompt":
      return <AddSeedDialogPrompt />;
    case "Searching":
      return <AddSeedDialogSearching />;
    case "Empty":
      return <AddSeedDialogEmpty query={state.query} />;
    case "Results":
      return (
        <AddSeedDialogResults
          artists={state.artists}
          songs={state.songs}
          isMutating={isMutating}
          onAdd={onAdd}
        />
      );
    case "LoadError":
    case "Defect":
      return <AddSeedDialogEmpty query="search" />;
  }
}

/**
 * Toast label for a successful seed add. The handler returns the raw
 * Pandora `addMusic` payload (`Schema.Unknown` at the wire), which is the
 * same shape the legacy tRPC `radio.addSeed` mutation hook returned.
 * Structurally probe the optional song/artist names and fall back to
 * "Seed" when neither is present.
 */
function seedToastName(value: unknown): string {
  if (typeof value !== "object" || value === null) return "Seed";
  const song = (value as { songName?: unknown }).songName;
  if (typeof song === "string" && song.length > 0) return song;
  const artist = (value as { artistName?: unknown }).artistName;
  if (typeof artist === "string" && artist.length > 0) return artist;
  return "Seed";
}
