import { createFileRoute } from "@tanstack/react-router";
import { QueueCoverflowPage } from "@app/features/sandbox/QueueCoverflow/QueueCoverflowPage";

export const Route = createFileRoute("/sandbox/queue")({
  component: QueueCoverflowPage,
});
