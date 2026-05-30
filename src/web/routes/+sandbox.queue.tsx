import { createFileRoute } from "@tanstack/react-router";
import { QueueCoverflowPage } from "@app/features/sandbox/queue-coverflow/QueueCoverflowPage";

export const Route = createFileRoute("/sandbox/queue")({
  component: QueueCoverflowPage,
});
