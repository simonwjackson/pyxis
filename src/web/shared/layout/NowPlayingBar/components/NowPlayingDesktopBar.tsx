import type { ReactNode } from "react";

type NowPlayingDesktopBarProps = {
  readonly children: ReactNode;
};

export function NowPlayingDesktopBar({ children }: NowPlayingDesktopBarProps) {
  return (
    <div className="hidden sm:flex items-center gap-5 px-6 py-3">
      {children}
    </div>
  );
}
