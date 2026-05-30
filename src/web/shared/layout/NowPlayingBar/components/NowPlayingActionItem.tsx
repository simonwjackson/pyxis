import type { ReactNode } from "react";

type NowPlayingActionItemProps = {
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly tone?: "default" | "liked" | "disliked";
  readonly divider?: "bottom" | "none";
};

const toneClassName: Record<
  NonNullable<NowPlayingActionItemProps["tone"]>,
  string
> = {
  default: "text-pyxis-muted hover:text-pyxis-text",
  liked: "text-pyxis-muted hover:text-[var(--color-liked)]",
  disliked: "text-pyxis-muted hover:text-[var(--color-disliked)]",
};

export function NowPlayingActionItem({
  onClick,
  children,
  tone = "default",
  divider = "none",
}: NowPlayingActionItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left py-3 transition-colors zune-heading text-lg ${toneClassName[tone]} ${divider === "bottom" ? "border-b border-pyxis-border" : ""}`}
    >
      {children}
    </button>
  );
}
