import { useStationDetailPage } from "./StationDetailPage.context";

export function StationDetailNotFoundState() {
  const { state } = useStationDetailPage();
  if (state._tag !== "NotFound") return null;

  return (
    <div className="page-frame lattice-container">
      <p className="text-pyxis-dim">station not found.</p>
    </div>
  );
}
