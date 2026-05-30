import { createFileRoute } from "@tanstack/react-router";
import { StationsPage } from "@app/features/stations/stations-page";

export const Route = createFileRoute("/stations")({
  component: StationsPage,
});
