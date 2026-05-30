import { Search } from "lucide-react";
import type { RefObject } from "react";

type AddSeedDialogHeaderProps = {
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
};

export function AddSeedDialogHeader({
  inputRef,
  query,
  onQueryChange,
}: AddSeedDialogHeaderProps) {
  return (
    <div className="p-4 border-b border-pyxis-border shrink-0">
      <h2
        id="add-seed-dialog-title"
        className="zune-heading text-2xl text-pyxis-text mb-3"
      >
        Add Seed
      </h2>
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-pyxis-dim"
          aria-hidden="true"
        />
        <label htmlFor="add-seed-search" className="sr-only">
          Search artists or songs
        </label>
        <input
          ref={inputRef}
          id="add-seed-search"
          type="text"
          placeholder="search artists or songs..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-pyxis-highlight border border-pyxis-border text-sm text-pyxis-text placeholder:text-pyxis-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pyxis-border-active"
        />
      </div>
    </div>
  );
}
