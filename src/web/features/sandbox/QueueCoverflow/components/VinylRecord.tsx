/**
 * @module VinylRecord
 *
 * The spinning vinyl record rendered behind the album cover in the Queue
 * detail view. Purely presentational; driven by size, dominant color, and a
 * `spinning` flag.
 */

export function VinylRecord({
  size,
  color,
  title,
  artist,
  spinning,
}: {
  readonly size: number;
  readonly color: string;
  readonly title: string;
  readonly artist: string;
  readonly spinning: boolean;
}) {
  const labelRadius = size * 0.18;
  const textPathRadius = labelRadius * 0.68;
  const grooveCount = 28;

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        position: "relative",
        animation: spinning ? "vinyl-spin 3s linear infinite" : undefined,
        background: `
          radial-gradient(circle at 50% 50%, transparent ${labelRadius - 2}px, ${color}22 ${labelRadius}px, transparent ${labelRadius + 1}px),
          radial-gradient(circle at 35% 35%, ${color}33 0%, transparent 50%),
          radial-gradient(circle at 65% 60%, ${color}22 0%, transparent 40%),
          radial-gradient(circle, #1a1a1a 0%, #111 40%, #1a1a1a 60%, #0d0d0d 100%)
        `,
        boxShadow: [
          "inset 0 0 0 1px rgba(255,255,255,0.04)",
          "0 2px 8px rgba(0,0,0,0.3)",
          "0 12px 32px rgba(0,0,0,0.25)",
        ].join(", "),
      }}
    >
      {/* Groove lines */}
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        style={{ position: "absolute", inset: 0 }}
      >
        {Array.from({ length: grooveCount }, (_, i) => {
          const r =
            labelRadius +
            4 +
            ((size / 2 - labelRadius - 8) / grooveCount) * (i + 0.5);
          return (
            <circle
              key={`groove-${r.toFixed(2)}`}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.03)"
              strokeWidth={0.5}
            />
          );
        })}
      </svg>

      {/* Highlight sheen */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.03) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Center label */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: labelRadius * 2,
          height: labelRadius * 2,
          marginLeft: -labelRadius,
          marginTop: -labelRadius,
          borderRadius: "50%",
          background: `
            radial-gradient(circle, ${color}44 0%, ${color}88 60%, ${color}66 100%)
          `,
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 8px rgba(0,0,0,0.4)",
        }}
      >
        {/* Spindle hole */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 6,
            height: 6,
            marginLeft: -3,
            marginTop: -3,
            borderRadius: "50%",
            background: "#111",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.6)",
          }}
        />
        {/* Circular text */}
        <svg
          aria-hidden="true"
          width={labelRadius * 2}
          height={labelRadius * 2}
          style={{ position: "absolute", inset: 0 }}
        >
          <defs>
            <path
              id="label-curve"
              d={`M ${labelRadius},${labelRadius - textPathRadius} A ${textPathRadius},${textPathRadius} 0 1,1 ${labelRadius - 0.01},${labelRadius - textPathRadius}`}
            />
          </defs>
          <text
            fill="rgba(255,255,255,0.7)"
            fontSize={Math.max(7, labelRadius * 0.16)}
            fontFamily="'Urbanist', system-ui, sans-serif"
            fontWeight={600}
            letterSpacing="0.12em"
          >
            <textPath href="#label-curve" startOffset="0%">
              {title.toUpperCase()} · {artist.toUpperCase()} ·{" "}
              {title.toUpperCase()} · {artist.toUpperCase()}
            </textPath>
          </text>
        </svg>
      </div>
    </div>
  );
}
