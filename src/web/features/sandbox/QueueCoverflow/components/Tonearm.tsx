/**
 * @module Tonearm
 *
 * The turntable tonearm prop that swings over the vinyl in the Queue detail
 * view. Purely presentational; `engaged` rotates it onto the record.
 */

export function Tonearm({
  size,
  engaged,
}: {
  readonly size: number;
  readonly engaged: boolean;
}) {
  const armLength = size * 0.48;
  const headWidth = size * 0.04;

  return (
    <div
      style={{
        position: "absolute",
        top: size * 0.08,
        right: size * 0.08,
        width: armLength,
        height: armLength,
        transformOrigin: "85% 8%",
        transform: `rotate(${engaged ? 22 : 0}deg)`,
        transition: "transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        zIndex: 10,
      }}
    >
      {/* Pivot base */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: size * 0.07,
          height: size * 0.07,
          borderRadius: "50%",
          background: "radial-gradient(circle, #444 0%, #222 100%)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
        }}
      />
      {/* Arm shaft */}
      <div
        style={{
          position: "absolute",
          right: size * 0.035 - 1.5,
          top: size * 0.035,
          width: 3,
          height: armLength * 0.85,
          background: "linear-gradient(90deg, #666, #aaa, #666)",
          borderRadius: 1.5,
          transformOrigin: "top center",
          transform: "rotate(0deg)",
          boxShadow: "1px 2px 4px rgba(0,0,0,0.3)",
        }}
      />
      {/* Cartridge/head */}
      <div
        style={{
          position: "absolute",
          right: size * 0.035 - headWidth / 2,
          top: size * 0.035 + armLength * 0.83,
          width: headWidth,
          height: headWidth * 1.8,
          background: "linear-gradient(180deg, #333, #111)",
          borderRadius: 1,
          boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
}
