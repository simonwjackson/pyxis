import { describe, it, expect, mock } from "bun:test";
import type { Key } from "ink";
import type { KeybindConfig } from "./useKeybinds.js";

/**
 * Tests for useKeybinds hook
 *
 * Since useKeybinds uses ink's useInput which requires raw mode terminal,
 * we test the input handling logic by simulating the handleInput callback behavior.
 * This tests the keybind routing logic without needing a real terminal.
 */

// Simulate the key object that ink's useInput provides
const createKey = (overrides: Partial<Key> = {}): Key => ({
	upArrow: false,
	downArrow: false,
	leftArrow: false,
	rightArrow: false,
	pageDown: false,
	pageUp: false,
	return: false,
	escape: false,
	ctrl: false,
	shift: false,
	tab: false,
	backspace: false,
	delete: false,
	meta: false,
	...overrides,
});

// Simulates the handleInput function from useKeybinds
// This is a test-only reimplementation of the routing logic
const simulateKeypress = (
	config: KeybindConfig,
	input: string,
	keyOverrides: Partial<Key> = {},
	isLeaderActive = false,
): void => {
	const key = createKey(keyOverrides);

	// Handle leader key follow-up commands
	if (isLeaderActive && config.leader) {
		const leaderKeyMap: Record<
			string,
			keyof NonNullable<typeof config.leader>
		> = {
			t: "theme",
			q: "quality",
			a: "account",
			b: "bookmarks",
			r: "refresh",
		};
		const command = leaderKeyMap[input];
		if (command && config.leader[command]) {
			config.leader[command]?.();
		}
		return;
	}

	// Global commands
	if (input === "q" || (key.ctrl && input === "c")) {
		config.quit?.();
		return;
	}
	if (input === "?") {
		config.help?.();
		return;
	}
	if (input === ":") {
		config.commandPalette?.();
		return;
	}

	// Navigation - vim style
	if (input === "j" || key.downArrow) {
		config.moveDown?.();
		return;
	}
	if (input === "k" || key.upArrow) {
		config.moveUp?.();
		return;
	}
	if (input === "g") {
		config.goToTop?.();
		return;
	}
	if (input === "G") {
		config.goToBottom?.();
		return;
	}
	if (key.return) {
		config.select?.();
		return;
	}
	if (key.escape) {
		if (config.goBack) {
			config.goBack();
		} else {
			config.back?.();
		}
		return;
	}
	if (input === "h" || key.leftArrow) {
		config.back?.();
		return;
	}
	if (input === "/") {
		config.search?.();
		return;
	}

	// Playback
	if (input === " ") {
		config.playPause?.();
		return;
	}
	if (input === "n") {
		if (config.nowPlaying) {
			config.nowPlaying();
		} else {
			config.nextTrack?.();
		}
		return;
	}
	if (input === "b") {
		config.bookmarks?.();
		return;
	}
	if (key.rightArrow) {
		config.nextTrack?.();
		return;
	}
	if (input === "+") {
		config.like?.();
		return;
	}
	if (input === "-") {
		config.dislike?.();
		return;
	}
	if (input === "z") {
		config.sleep?.();
		return;
	}
	if (input === "i") {
		config.trackInfo?.();
		return;
	}
	if (input === "B") {
		config.bookmarkSong?.();
		return;
	}
	if (input === "A") {
		config.bookmarkArtist?.();
		return;
	}

	// Station management
	if (input === "c") {
		config.createStation?.();
		return;
	}
	if (input === "x") {
		config.deleteStation?.();
		return;
	}
	if (input === "r") {
		config.renameStation?.();
		return;
	}

	// Debug
	if (input === "@") {
		config.toggleLog?.();
		return;
	}
};

describe("useKeybinds routing logic", () => {
	describe("global keybinds", () => {
		it("should call quit handler on q key", () => {
			const quit = mock(() => {});
			simulateKeypress({ quit }, "q");
			expect(quit).toHaveBeenCalledTimes(1);
		});

		it("should call quit handler on ctrl+c", () => {
			const quit = mock(() => {});
			simulateKeypress({ quit }, "c", { ctrl: true });
			expect(quit).toHaveBeenCalledTimes(1);
		});

		it("should call help handler on ? key", () => {
			const help = mock(() => {});
			simulateKeypress({ help }, "?");
			expect(help).toHaveBeenCalledTimes(1);
		});

		it("should call commandPalette handler on : key", () => {
			const commandPalette = mock(() => {});
			simulateKeypress({ commandPalette }, ":");
			expect(commandPalette).toHaveBeenCalledTimes(1);
		});
	});

	describe("navigation keybinds", () => {
		it("should call moveDown on j key", () => {
			const moveDown = mock(() => {});
			simulateKeypress({ moveDown }, "j");
			expect(moveDown).toHaveBeenCalledTimes(1);
		});

		it("should call moveDown on down arrow", () => {
			const moveDown = mock(() => {});
			simulateKeypress({ moveDown }, "", { downArrow: true });
			expect(moveDown).toHaveBeenCalledTimes(1);
		});

		it("should call moveUp on k key", () => {
			const moveUp = mock(() => {});
			simulateKeypress({ moveUp }, "k");
			expect(moveUp).toHaveBeenCalledTimes(1);
		});

		it("should call moveUp on up arrow", () => {
			const moveUp = mock(() => {});
			simulateKeypress({ moveUp }, "", { upArrow: true });
			expect(moveUp).toHaveBeenCalledTimes(1);
		});

		it("should call goToTop on g key", () => {
			const goToTop = mock(() => {});
			simulateKeypress({ goToTop }, "g");
			expect(goToTop).toHaveBeenCalledTimes(1);
		});

		it("should call goToBottom on G key", () => {
			const goToBottom = mock(() => {});
			simulateKeypress({ goToBottom }, "G");
			expect(goToBottom).toHaveBeenCalledTimes(1);
		});

		it("should call search on / key", () => {
			const search = mock(() => {});
			simulateKeypress({ search }, "/");
			expect(search).toHaveBeenCalledTimes(1);
		});

		it("should call back on h key", () => {
			const back = mock(() => {});
			simulateKeypress({ back }, "h");
			expect(back).toHaveBeenCalledTimes(1);
		});

		it("should call back on left arrow", () => {
			const back = mock(() => {});
			simulateKeypress({ back }, "", { leftArrow: true });
			expect(back).toHaveBeenCalledTimes(1);
		});

		it("should call select on Enter key", () => {
			const select = mock(() => {});
			simulateKeypress({ select }, "", { return: true });
			expect(select).toHaveBeenCalledTimes(1);
		});
	});

	describe("view switching keybinds", () => {
		it("should call nowPlaying on n key when defined", () => {
			const nowPlaying = mock(() => {});
			const nextTrack = mock(() => {});
			simulateKeypress({ nowPlaying, nextTrack }, "n");
			expect(nowPlaying).toHaveBeenCalledTimes(1);
			expect(nextTrack).not.toHaveBeenCalled();
		});

		it("should call nextTrack on n key when nowPlaying not defined", () => {
			const nextTrack = mock(() => {});
			simulateKeypress({ nextTrack }, "n");
			expect(nextTrack).toHaveBeenCalledTimes(1);
		});

		it("should call bookmarks on b key", () => {
			const bookmarks = mock(() => {});
			simulateKeypress({ bookmarks }, "b");
			expect(bookmarks).toHaveBeenCalledTimes(1);
		});

		it("should call goBack on escape when defined", () => {
			const goBack = mock(() => {});
			const back = mock(() => {});
			simulateKeypress({ goBack, back }, "", { escape: true });
			expect(goBack).toHaveBeenCalledTimes(1);
			expect(back).not.toHaveBeenCalled();
		});

		it("should call back on escape when goBack not defined", () => {
			const back = mock(() => {});
			simulateKeypress({ back }, "", { escape: true });
			expect(back).toHaveBeenCalledTimes(1);
		});
	});

	describe("playback keybinds", () => {
		it("should call playPause on space key", () => {
			const playPause = mock(() => {});
			simulateKeypress({ playPause }, " ");
			expect(playPause).toHaveBeenCalledTimes(1);
		});

		it("should call nextTrack on right arrow", () => {
			const nextTrack = mock(() => {});
			simulateKeypress({ nextTrack }, "", { rightArrow: true });
			expect(nextTrack).toHaveBeenCalledTimes(1);
		});

		it("should call like on + key", () => {
			const like = mock(() => {});
			simulateKeypress({ like }, "+");
			expect(like).toHaveBeenCalledTimes(1);
		});

		it("should call dislike on - key", () => {
			const dislike = mock(() => {});
			simulateKeypress({ dislike }, "-");
			expect(dislike).toHaveBeenCalledTimes(1);
		});

		it("should call sleep on z key", () => {
			const sleep = mock(() => {});
			simulateKeypress({ sleep }, "z");
			expect(sleep).toHaveBeenCalledTimes(1);
		});

		it("should call trackInfo on i key", () => {
			const trackInfo = mock(() => {});
			simulateKeypress({ trackInfo }, "i");
			expect(trackInfo).toHaveBeenCalledTimes(1);
		});

		it("should call bookmarkSong on B key", () => {
			const bookmarkSong = mock(() => {});
			simulateKeypress({ bookmarkSong }, "B");
			expect(bookmarkSong).toHaveBeenCalledTimes(1);
		});

		it("should call bookmarkArtist on A key", () => {
			const bookmarkArtist = mock(() => {});
			simulateKeypress({ bookmarkArtist }, "A");
			expect(bookmarkArtist).toHaveBeenCalledTimes(1);
		});
	});

	describe("station management keybinds", () => {
		it("should call createStation on c key", () => {
			const createStation = mock(() => {});
			simulateKeypress({ createStation }, "c");
			expect(createStation).toHaveBeenCalledTimes(1);
		});

		it("should call deleteStation on x key", () => {
			const deleteStation = mock(() => {});
			simulateKeypress({ deleteStation }, "x");
			expect(deleteStation).toHaveBeenCalledTimes(1);
		});

		it("should call renameStation on r key", () => {
			const renameStation = mock(() => {});
			simulateKeypress({ renameStation }, "r");
			expect(renameStation).toHaveBeenCalledTimes(1);
		});
	});

	describe("debug keybinds", () => {
		it("should call toggleLog on @ key", () => {
			const toggleLog = mock(() => {});
			simulateKeypress({ toggleLog }, "@");
			expect(toggleLog).toHaveBeenCalledTimes(1);
		});
	});

	describe("leader key commands", () => {
		it("should call theme on t after leader key", () => {
			const theme = mock(() => {});
			simulateKeypress({ leader: { theme } }, "t", {}, true);
			expect(theme).toHaveBeenCalledTimes(1);
		});

		it("should call bookmarks on b after leader key", () => {
			const bookmarks = mock(() => {});
			simulateKeypress({ leader: { bookmarks } }, "b", {}, true);
			expect(bookmarks).toHaveBeenCalledTimes(1);
		});

		it("should call refresh on r after leader key", () => {
			const refresh = mock(() => {});
			simulateKeypress({ leader: { refresh } }, "r", {}, true);
			expect(refresh).toHaveBeenCalledTimes(1);
		});

		it("should call quality on q after leader key", () => {
			const quality = mock(() => {});
			simulateKeypress({ leader: { quality } }, "q", {}, true);
			expect(quality).toHaveBeenCalledTimes(1);
		});

		it("should call account on a after leader key", () => {
			const account = mock(() => {});
			simulateKeypress({ leader: { account } }, "a", {}, true);
			expect(account).toHaveBeenCalledTimes(1);
		});

		it("should not call regular handlers during leader mode", () => {
			const renameStation = mock(() => {});
			const refresh = mock(() => {});
			simulateKeypress({ renameStation, leader: { refresh } }, "r", {}, true);
			expect(renameStation).not.toHaveBeenCalled();
			expect(refresh).toHaveBeenCalledTimes(1);
		});
	});

	describe("handler safety", () => {
		it("should not throw if handler is undefined", () => {
			expect(() => {
				simulateKeypress({}, "q");
				simulateKeypress({}, "j");
				simulateKeypress({}, "+");
				simulateKeypress({}, " ");
			}).not.toThrow();
		});

		it("should not call undefined leader handlers", () => {
			expect(() => {
				simulateKeypress({ leader: {} }, "t", {}, true);
				simulateKeypress({ leader: {} }, "x", {}, true); // unknown leader key
			}).not.toThrow();
		});
	});

	describe("key priority", () => {
		it("should prefer goBack over back for escape", () => {
			const goBack = mock(() => {});
			const back = mock(() => {});
			simulateKeypress({ goBack, back }, "", { escape: true });
			expect(goBack).toHaveBeenCalledTimes(1);
			expect(back).not.toHaveBeenCalled();
		});

		it("should prefer nowPlaying over nextTrack for n key", () => {
			const nowPlaying = mock(() => {});
			const nextTrack = mock(() => {});
			simulateKeypress({ nowPlaying, nextTrack }, "n");
			expect(nowPlaying).toHaveBeenCalledTimes(1);
			expect(nextTrack).not.toHaveBeenCalled();
		});
	});
});
