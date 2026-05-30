import { createFileRoute } from "@tanstack/react-router";
import { SearchPage } from "@app/features/search/SearchPage";

export const Route = createFileRoute("/search")({
  component: SearchPage,
});
