/**
 * @module QueueTitleBar
 *
 * The floating title pill at the top of the Queue cover-flow ("Queue"). Fades
 * out when the detail view is open. Purely presentational.
 */

export function QueueTitleBar({
  label = "Queue",
  visible = true,
}: {
  readonly label?: string;
  readonly visible?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 24,
        left: 0,
        right: 0,
        textAlign: "center",
        zIndex: 200,
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <span
        style={{
          color: "rgba(255,255,255,0.85)",
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
      >
        {label}
      </span>
    </div>
  );
}
