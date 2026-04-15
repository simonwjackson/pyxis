import type { ReactNode } from "react";
import { SonosSpeakerPicker } from "@/web/shared/layout/sonos-speaker-picker";

type NowPlayingSecondaryActionsProps = {
	readonly currentTrackId: string;
	readonly children?: ReactNode;
};

export function NowPlayingSecondaryActions({
	currentTrackId,
	children,
}: NowPlayingSecondaryActionsProps) {
	return (
		<div className="flex items-center gap-0.5">
			<SonosSpeakerPicker currentTrackId={currentTrackId} />
			{children}
		</div>
	);
}
