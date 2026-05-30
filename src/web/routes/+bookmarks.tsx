import { createFileRoute } from "@tanstack/react-router";
import { BookmarksPage } from "@app/features/bookmarks/BookmarksPage";

export const Route = createFileRoute("/bookmarks")({
  component: BookmarksPage,
});
