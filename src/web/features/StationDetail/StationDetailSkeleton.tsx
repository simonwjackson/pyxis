import { Skeleton } from "@app/shared/ui/Skeleton";

const ARTIST_SEED_SKELETON_KEYS = [
  "artist-seed-1",
  "artist-seed-2",
  "artist-seed-3",
] as const;
const FEEDBACK_SKELETON_KEYS = [
  "feedback-1",
  "feedback-2",
  "feedback-3",
  "feedback-4",
] as const;

export function StationDetailSkeleton() {
  return (
    <div className="page-frame lattice-container space-y-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Skeleton className="w-9 h-9" />
        <div>
          <Skeleton className="h-6 w-48 mb-1" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <div>
        <Skeleton className="h-4 w-16 mb-3" />
        <div className="space-y-1">
          {ARTIST_SEED_SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-12 w-full" />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-4 w-20 mb-3" />
        <div className="space-y-1">
          {FEEDBACK_SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
