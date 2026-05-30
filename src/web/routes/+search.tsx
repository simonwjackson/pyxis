import { createFileRoute } from "@tanstack/react-router";
import { SearchPage } from "@app/features/search/search-page";

export const Route = createFileRoute("/search")({
  component: SearchPage,
});
