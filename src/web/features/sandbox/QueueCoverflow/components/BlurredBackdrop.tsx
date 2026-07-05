/**
 * @module BlurredBackdrop
 *
 * The blurred, saturated album-art backdrop (plus dimming scrim) behind the
 * Queue cover-flow. Purely presentational; driven by the current artwork URL.
 */

export function BlurredBackdrop({ artwork }: { readonly artwork: string }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: "-20%",
          backgroundImage: `url(${artwork})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(64px) saturate(1.6) brightness(0.45)",
          transform: "scale(1.3)",
          transition: "background-image 1.2s ease, filter 1.2s ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.25)",
        }}
      />
    </>
  );
}
