import type { ReactNode } from "react";

type NowPlayingMobileBarProps = {
  readonly children: ReactNode;
};

export function NowPlayingMobileBar({ children }: NowPlayingMobileBarProps) {
  return (
    <div className="sm:hidden flex items-center gap-3 px-5 py-3">
      {children}
    </div>
  );
}
