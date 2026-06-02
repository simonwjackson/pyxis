import { useStationDetailPage } from "./StationDetailPage.context";

export function StationDetailFailureState() {
  const { state } = useStationDetailPage();
  if (state._tag !== "LoadError" && state._tag !== "Defect") return null;

  return (
    <div className="page-frame lattice-container">
      <p className="text-pyxis-error">Failed to load station details</p>
    </div>
  );
}
