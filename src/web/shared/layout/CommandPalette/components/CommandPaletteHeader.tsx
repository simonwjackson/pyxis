import { Search } from "lucide-react";
import type { RefObject } from "react";

type CommandPaletteHeaderProps = {
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
};

export function CommandPaletteHeader({
  inputRef,
  query,
  onQueryChange,
}: CommandPaletteHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-pyxis-border">
      <Search className="w-5 h-5 text-pyxis-dim shrink-0" />
      <input
        ref={inputRef}
        type="text"
        placeholder="type a command..."
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className="flex-1 bg-transparent text-pyxis-text placeholder-[var(--color-text-dim)] outline-none text-base font-light tracking-[-0.02em] lowercase"
      />
      <kbd className="zune-label px-1.5 py-0.5 text-pyxis-dim bg-pyxis-highlight border border-pyxis-border">
        esc
      </kbd>
    </div>
  );
}
