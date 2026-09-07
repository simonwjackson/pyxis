import "./components.css"
export interface ArtworkProps {
  readonly src?: string
  readonly label: string
  readonly treatment?: "flat" | "object"
}
export function Artwork({ src, label, treatment = "flat" }: ArtworkProps) {
  return (
    <span className="px-artwork" data-treatment={treatment} role="img" aria-label={label}>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true
          }}
        />
      ) : null}
      <span className="px-artwork-fallback" aria-hidden="true">
        No artwork
      </span>
    </span>
  )
}
