import type { ReactNode } from "react";

type NowPlayingSecondaryActionsProps = {
  readonly children?: ReactNode;
};

export function NowPlayingSecondaryActions({
  children,
}: NowPlayingSecondaryActionsProps) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}
