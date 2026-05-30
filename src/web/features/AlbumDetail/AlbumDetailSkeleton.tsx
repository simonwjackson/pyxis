import { Skeleton } from "@app/shared/ui/Skeleton";

export function AlbumDetailSkeleton() {
  return (
    <div className="flex-1 px-4 sm:px-8 py-10 max-w-3xl mx-auto space-y-8">
      <Skeleton className="h-5 w-16" />
      <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-end">
        <Skeleton className="w-40 h-40 sm:w-56 sm:h-56 shrink-0" />
        <div className="space-y-2 flex-1 items-center sm:items-start flex flex-col">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-48" />
          <div className="flex gap-3 pt-4 justify-center sm:justify-start">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 px-3 py-2.5">
            <Skeleton className="w-6 h-4" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="w-10 h-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
