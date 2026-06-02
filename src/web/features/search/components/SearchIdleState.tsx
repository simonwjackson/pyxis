import { useSearchPage } from "../SearchPage.context";

export function SearchIdleState() {
  const { state } = useSearchPage();
  if (state._tag !== "Idle") return null;

  return (
    <div className="text-center py-20 text-pyxis-dim">
      <p className="zune-display text-5xl sm:text-6xl text-pyxis-dim/40 mb-6">
        discover
      </p>
      <p className="text-sm">
        search for artists, songs, or albums across all sources
      </p>
    </div>
  );
}
