export type StationSeed = {
	readonly seedId: string;
	readonly musicToken?: string;
	readonly songName?: string;
	readonly artistName?: string;
};

export type StationFeedback = {
	readonly feedbackId: string;
	readonly songName: string;
	readonly artistName: string;
};

export type StationDetailPageProps = {
	readonly token: string;
	readonly autoPlay?: boolean;
};
