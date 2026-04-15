import { createFileRoute } from "@tanstack/react-router";
import { QueueCoverflowPage } from "@/web/features/sandbox/queue-coverflow/QueueCoverflowPage";

export const Route = createFileRoute("/sandbox/queue")({
  component: QueueCoverflowPage,
});
