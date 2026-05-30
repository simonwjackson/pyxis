import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@app/features/settings/SettingsPage";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});
