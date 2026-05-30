import { createFileRoute } from "@tanstack/react-router";
import { GenresPage } from "@app/features/genres/GenresPage";

export const Route = createFileRoute("/genres")({
  component: GenresPage,
});
