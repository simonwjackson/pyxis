import { QueueHome } from "@app/features/sandbox/QueueCoverflow/QueueHome";
import { PartStage } from "./PartStage";

export const name = "Home — Carousel";
export const note = "Home surface, carousel variation, in the coverflow theme.";

export default function HomeCarouselTemplate() {
  return (
    <PartStage width="100%" height="100%" contain>
      <QueueHome variant="carousel" />
    </PartStage>
  );
}
