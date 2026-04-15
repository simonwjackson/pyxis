export type RadioStation = {
	/** Opaque station identifier (pandora:stationToken) */
	readonly id: string;
	/** Station token */
	readonly stationId: string;
	/** Display name */
	readonly name: string;
	/** Whether this is the QuickMix/Shuffle station */
	readonly isQuickMix: boolean;
	/** Whether deletion is allowed */
	readonly allowDelete?: boolean;
	/** Whether renaming is allowed */
	readonly allowRename?: boolean;
	/** Station IDs included in QuickMix (if this is QuickMix) */
	readonly quickMixStationIds?: readonly string[];
};
