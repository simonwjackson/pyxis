import "./components.css"
export interface IconProps {
  readonly name: "play" | "pause" | "previous" | "next" | "down" | "sound"
  readonly size?: "small" | "regular" | "large"
}
const paths = {
  play: "M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z",
  pause: "M5 4h5v16H5zM14 4h5v16h-5z",
  previous:
    "M4 5h2.5v14H4zM19 5.9v12.2a1 1 0 0 1-1.55.83L8.6 13a1.2 1.2 0 0 1 0-2l8.85-5.93A1 1 0 0 1 19 5.9z",
  next: "M17.5 5H20v14h-2.5zM5 5.9v12.2a1 1 0 0 0 1.55.83L15.4 13a1.2 1.2 0 0 0 0-2L6.55 5.07A1 1 0 0 0 5 5.9z",
  down: "M4.3 8.3a1 1 0 0 1 1.4 0L12 14.6l6.3-6.3a1 1 0 1 1 1.4 1.4l-7 7a1 1 0 0 1-1.4 0l-7-7a1 1 0 0 1 0-1.4z",
  sound:
    "M4 9.5v5a1 1 0 0 0 1 1h2.6l4.7 3.8a.6.6 0 0 0 1-.47V5.17a.6.6 0 0 0-1-.47L7.6 8.5H5a1 1 0 0 0-1 1zM16.2 8.6a1 1 0 0 1 1.4.1 5 5 0 0 1 0 6.6 1 1 0 0 1-1.5-1.3 3 3 0 0 0 0-4 1 1 0 0 1 .1-1.4z",
} as const
export function Icon({ name, size = "regular" }: IconProps) {
  return (
    <svg
      className="px-icon"
      data-size={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  )
}
