/**
 * @module PartStage
 *
 * Shared catalog preview frame for the cover-flow parts: a dark, centered box
 * matching the surface backdrop so light-on-dark components read correctly in
 * the Parts panel. Not a `.part.tsx`, so it is not itself discovered.
 */

import type { CSSProperties, ReactNode } from "react";

export function PartStage({
  children,
  width = 300,
  height = 220,
  contain = false,
  padding = 16,
}: {
  readonly children: ReactNode;
  readonly width?: number | string;
  readonly height?: number | string;
  readonly contain?: boolean;
  readonly padding?: number;
}) {
  const style: CSSProperties = {
    position: "relative",
    width,
    height,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding,
    background:
      "radial-gradient(circle at 50% 30%, #23202b 0%, #0d0d10 70%, #08080b 100%)",
    fontFamily: "'Urbanist', system-ui, sans-serif",
    // A transform ancestor contains any `position: fixed` descendant to this box.
    ...(contain ? { transform: "translateZ(0)" } : {}),
  };
  return <div style={style}>{children}</div>;
}
