import { createFileRoute } from "@tanstack/react-router";
import { StationDetailPage } from "@app/features/StationDetail/StationDetailPage";

function StationDetailRoute() {
  const { token } = Route.useParams();
  const search = Route.useSearch();
  return <StationDetailPage token={token} autoPlay={search.play === "1"} />;
}

export const Route = createFileRoute("/station/$token")({
  component: StationDetailRoute,
  validateSearch: (search: Record<string, unknown>) => ({
    play: typeof search.play === "string" ? search.play : undefined,
  }),
});
