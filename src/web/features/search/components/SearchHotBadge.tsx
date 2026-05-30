import { hotBadgeClassName } from "@app/shared/lib/libraryPlacement";

export function SearchHotBadge() {
  return (
    <span
      className={`text-[10px] uppercase tracking-[0.18em] px-1.5 py-0.5 ${hotBadgeClassName()}`}
    >
      Hot
    </span>
  );
}
