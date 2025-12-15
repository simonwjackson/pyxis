export type PyxisTheme = {
	readonly name: string;
	readonly colors: {
		readonly primary: string;
		readonly secondary: string;
		readonly accent: string;
		readonly text: string;
		readonly textMuted: string;
		readonly textDim: string;
		readonly background: string;
		readonly backgroundPanel: string;
		readonly backgroundHighlight: string;
		readonly backgroundSelection: string;
		readonly border: string;
		readonly borderActive: string;
		readonly borderMuted: string;
		readonly error: string;
		readonly warning: string;
		readonly success: string;
		readonly info: string;
		readonly playing: string;
		readonly liked: string;
		readonly disliked: string;
		readonly progress: string;
		readonly progressTrack: string;
	};
	readonly borders: {
		readonly style: "single" | "double" | "round" | "bold";
	};
	readonly icons: {
		readonly playing: string;
		readonly paused: string;
		readonly liked: string;
		readonly disliked: string;
		readonly station: string;
		readonly search: string;
	};
};
