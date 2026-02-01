/**
 * YouTube Music API Configuration
 * Based on the WEB_REMIX client used by the official web player
 */

export const BASE_CONTEXT = {
	context: {
		client: {
			hl: "en",
			gl: "US",
			remoteHost: "1.1.1.1",
			deviceMake: "",
			deviceModel: "",
			userAgent:
				"Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0,gzip(gfe)",
			clientName: "WEB_REMIX",
			clientVersion: "1.20241023.01.00",
			osName: "X11",
			osVersion: "",
			platform: "DESKTOP",
			clientFormFactor: "UNKNOWN_FORM_FACTOR",
			userInterfaceTheme: "USER_INTERFACE_THEME_DARK",
			timeZone: "America/Chicago",
			browserName: "Firefox",
			browserVersion: "131.0",
			screenWidthPoints: 1317,
			screenHeightPoints: 787,
			screenPixelDensity: 1,
			utcOffsetMinutes: -300,
		},
		user: {
			lockedSafetyMode: false,
		},
		request: {
			useSsl: true,
			internalExperimentFlags: [],
			consistencyTokenJars: [],
		},
	},
} as const;

export const DEFAULT_HEADERS = {
	"Accept-Encoding": "gzip, deflate, br, zstd",
	"Accept-Language": "en-US,en;q=0.5",
	Accept: "*/*",
	"Alt-Used": "music.youtube.com",
	Connection: "keep-alive",
	"Content-Type": "application/json",
	DNT: "1",
	Origin: "https://music.youtube.com",
	"Sec-Fetch-Dest": "empty",
	"Sec-Fetch-Mode": "same-origin",
	"Sec-Fetch-Site": "same-origin",
	"Sec-GPC": "1",
	"User-Agent":
		"Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
	"X-Goog-AuthUser": "0",
	"X-Origin": "https://music.youtube.com",
	"X-Youtube-Bootstrap-Logged-In": "false",
	"X-Youtube-Client-Name": "67",
	"X-Youtube-Client-Version": "1.20241023.01.00",
	Referer: "https://music.youtube.com/library",
} as const;

// Search params for different content types (base64-encoded filter tokens)
export const SEARCH_PARAMS = {
	song: "EgWKAQIIAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D",
	album: "EgWKAQIYAWoOEAMQBBAJEAoQERAQEBU%3D",
	artist: "EgWKAQIgAWoQEAMQBBAJEAoQBRAREBAQFQ%3D%3D",
	playlist: "EgeKAQQoAEABahAQAxAEEAkQChAFEBEQEBAV",
} as const;

export type SearchType = keyof typeof SEARCH_PARAMS;
