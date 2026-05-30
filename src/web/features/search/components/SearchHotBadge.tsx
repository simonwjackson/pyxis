import { hotBadgeClassName } from "@app/shared/lib/libraryPlacement";

export function SearchHotBadge() {
  return (
    <span className={`zune-badge px-1.5 py-0.5 ${hotBadgeClassName()}`}>
      Hot
    </span>
  );
}
