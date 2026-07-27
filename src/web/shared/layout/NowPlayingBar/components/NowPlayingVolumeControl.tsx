import { Volume2 } from "lucide-react";
import { cn } from "../../../lib/utils";

type NowPlayingVolumeControlProps = {
  readonly volume: number;
  readonly onVolumeChange: (volume: number) => void;
  readonly className?: string;
};

export function NowPlayingVolumeControl({
  volume,
  onVolumeChange,
  className,
}: NowPlayingVolumeControlProps) {
  return (
    <label
      className={cn(
        "flex min-h-10 items-center gap-3 text-pyxis-muted",
        className,
      )}
    >
      <Volume2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={volume}
        onInput={(event) => onVolumeChange(event.currentTarget.valueAsNumber)}
        className="min-w-20 flex-1 accent-pyxis-primary"
        aria-label="Volume"
      />
      <output className="zune-data w-9 shrink-0 text-right text-xs tabular-nums text-pyxis-dim">
        {Math.round(volume)}%
      </output>
    </label>
  );
}
