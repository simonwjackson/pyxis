import { createFileRoute } from "@tanstack/react-router";
import { GenresPage } from "@app/features/genres/genres-page";

export const Route = createFileRoute("/genres")({
  component: GenresPage,
});
