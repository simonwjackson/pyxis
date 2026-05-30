import { Skeleton } from "@/web/shared/ui/skeleton";

export function StationDetailSkeleton() {
  return (
    <div className="flex-1 px-4 sm:px-8 py-10 space-y-8 max-w-3xl mx-auto">
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
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="h-4 w-20 mb-3" />
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
