import { Artwork } from "./Artwork.tsx"
import { StatusMark } from "./StatusMark.tsx"
import "./base.css"
import "./CoverButton.css"
export interface CoverButtonProps {
  readonly label: string
  readonly src?: string
  readonly treatment?: "flat" | "object"
  readonly availability?: "unknown" | "missing" | "downloading" | "available"
  readonly sounding?: boolean
  readonly onClick?: () => void
}
export function CoverButton({
  label,
  src,
  treatment = "flat",
  availability = "unknown",
  sounding = false,
  onClick,
}: CoverButtonProps) {
  return (
    <button
      className="px-cover-button"
      type="button"
      aria-label={label}
      data-sounding={sounding}
      onClick={onClick}
    >
      <Artwork label={label} treatment={treatment} {...(src ? { src } : {})} />
      {availability === "available" || availability === "downloading" ? (
        <span className="px-cover-mark">
          <StatusMark
            label={availability === "available" ? "Downloaded on this device" : "Downloading"}
            state={availability === "available" ? "ready" : "pending"}
          />
        </span>
      ) : null}
    </button>
  )
}
