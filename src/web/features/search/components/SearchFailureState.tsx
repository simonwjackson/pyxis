import { useSearchPage } from "../SearchPage.context";

export function SearchFailureState() {
  const { state } = useSearchPage();
  if (state._tag !== "LoadError" && state._tag !== "Defect") return null;

  return (
    <div className="text-center py-20 text-pyxis-error">
      <p className="text-sm">failed to search</p>
    </div>
  );
}
