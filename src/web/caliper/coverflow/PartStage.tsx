/**
 * @module PartStage
 *
 * Neutral sizing/centering wrapper for the cover-flow catalog parts. It adds no
 * background of its own — the lab's part card provides the preview surface — and
 * exists only to give absolutely/fixed-positioned components a sized containing
 * box. Not a `.part.tsx`, so it is not itself discovered.
 */

import type { CSSProperties, ReactNode } from "react";

export function PartStage({
  children,
  width,
  height,
  contain = false,
}: {
  readonly children: ReactNode;
  readonly width?: number | string;
  readonly height?: number | string;
  readonly contain?: boolean;
}) {
  const style: CSSProperties = {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(contain ? { overflow: "hidden", transform: "translateZ(0)" } : {}),
  };
  return <div style={style}>{children}</div>;
}
