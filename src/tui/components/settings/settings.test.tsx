import { describe, it, expect, mock, beforeEach } from "bun:test";
import React from "react";
import { render } from "ink-testing-library";
import { ThemeProvider, loadTheme } from "../../theme/index.js";
import { SettingsView } from "./index.js";
import { Effect } from "effect";

/**
 * Tests for SettingsView component
 * Uses ink-testing-library for component rendering tests
 *
 * Note: All tests must call unmount() to properly clean up the useInput hook
 */

// Mock the client module
const mockGetSettings = mock(() =>
	Effect.succeed({
		username: "user@example.com",
		isExplicitContentFilterEnabled: false,
		isProfilePrivate: true,
		emailOptIn: false,
		zipCode: "90210",
	}),
);

const mockChangeSettings = mock(() => Effect.succeed({}));

mock.module("../../../client.js", () => ({
	getSettings: mockGetSettings,
	changeSettings: mockChangeSettings,
}));

// Mock the session module
mock.module("../../../cli/cache/session.js", () => ({
	getSession: () =>
		Promise.resolve({
			syncTime: 1234567890,
			partnerId: "test-partner",
			partnerAuthToken: "test-partner-token",
			userAuthToken: "test-user-token",
			userId: "test-user-id",
		}),
}));

// Mock authState for direct prop passing
const mockAuthState = {
	syncTime: 1234567890,
	partnerId: "test-partner",
	partnerAuthToken: "test-partner-token",
	userAuthToken: "test-user-token",
	userId: "test-user-id",
};

// Wrapper component for theme context
const ThemedWrapper: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const theme = loadTheme("pyxis");
	return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};

// Helper to wait for async operations
const waitForAsync = (ms = 50) =>
	new Promise((resolve) => setTimeout(resolve, ms));

describe("SettingsView", () => {
	beforeEach(() => {
		// Reset mocks before each test
		mockGetSettings.mockClear();
		mockChangeSettings.mockClear();

		// Reset default mock implementation
		mockGetSettings.mockImplementation(() =>
			Effect.succeed({
				username: "user@example.com",
				isExplicitContentFilterEnabled: false,
				isProfilePrivate: true,
				emailOptIn: false,
				zipCode: "90210",
			}),
		);
	});

	describe("visibility", () => {
		it("should not render when isVisible is false", () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={false}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			expect(lastFrame()).toBe("");
			unmount();
		});

		it("should render when isVisible is true", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).not.toBe("");
			unmount();
		});
	});

	describe("title and structure", () => {
		it("should display 'Settings' title", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Settings");
			unmount();
		});

		it("should show Account section with username", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("Account");
			expect(frame).toContain("user@example.com");
			unmount();
		});

		it("should show Preferences section", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Preferences");
			unmount();
		});
	});

	describe("settings display", () => {
		it("should show Explicit Content Filter setting", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Explicit Content Filter");
			unmount();
		});

		it("should show Profile Privacy setting", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Profile Privacy");
			unmount();
		});

		it("should show Email Notifications setting", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Email Notifications");
			unmount();
		});

		it("should show Zip Code (display only)", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";
			expect(frame).toContain("Zip Code");
			expect(frame).toContain("90210");
			unmount();
		});

		it("should display toggle states correctly ([ON]/[OFF])", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";

			// Based on mock data: explicit=false, private=true, emailOptIn=false
			// So we should see both [ON] and [OFF]
			expect(frame).toContain("[OFF]");
			expect(frame).toContain("[ON]");
			unmount();
		});

		it("should display [OFF] for false settings and [ON] for true settings", async () => {
			mockGetSettings.mockImplementation(() =>
				Effect.succeed({
					username: "user@example.com",
					isExplicitContentFilterEnabled: true,
					isProfilePrivate: true,
					emailOptIn: true,
					zipCode: "12345",
				}),
			);

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";

			// All toggles are true, so all should show [ON]
			const onMatches = frame.match(/\[ON\]/g);
			expect(onMatches?.length).toBe(3);
			unmount();
		});

		it("should display [OFF] for all false settings", async () => {
			mockGetSettings.mockImplementation(() =>
				Effect.succeed({
					username: "user@example.com",
					isExplicitContentFilterEnabled: false,
					isProfilePrivate: false,
					emailOptIn: false,
					zipCode: "12345",
				}),
			);

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";

			// All toggles are false, so all should show [OFF]
			const offMatches = frame.match(/\[OFF\]/g);
			expect(offMatches?.length).toBe(3);
			unmount();
		});
	});

	describe("loading states", () => {
		it("should show loading state before settings are fetched", async () => {
			// Use a mock that delays the response to catch the loading state
			let resolveSettings: ((value: unknown) => void) | undefined;
			const delayedSettings = new Promise((resolve) => {
				resolveSettings = resolve;
			});

			mockGetSettings.mockImplementation(() =>
				Effect.promise(() => delayedSettings as Promise<unknown>).pipe(
					Effect.map(() => ({
						username: "user@example.com",
						isExplicitContentFilterEnabled: false,
						isProfilePrivate: true,
						emailOptIn: false,
						zipCode: "90210",
					})),
				),
			);

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			// Give the component time to enter loading state
			await waitForAsync(10);

			// Before async operation completes, should show loading
			const frame = lastFrame() || "";
			expect(frame).toContain("Loading settings...");

			// Cleanup: resolve the promise
			resolveSettings?.({});
			await waitForAsync();
			unmount();
		});

		it("should display settings after loading", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";

			// Should no longer show loading
			expect(frame).not.toContain("Loading settings...");
			// Should show actual settings
			expect(frame).toContain("Account");
			expect(frame).toContain("Preferences");
			unmount();
		});

		it("should show error message on fetch failure", async () => {
			mockGetSettings.mockImplementation(() =>
				Effect.fail({ _tag: "ApiCallError", message: "Network error" }),
			);

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Failed to load settings");
			unmount();
		});
	});

	describe("callbacks", () => {
		it("should accept onClose callback without error", async () => {
			let closeCalled = false;

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {
							closeCalled = true;
						}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Component should render without errors
			expect(lastFrame()).toContain("Settings");
			// onClose should not be called on initial render
			expect(closeCalled).toBe(false);
			unmount();
		});

		it("should accept onNotification callback without error", async () => {
			const notifications: Array<{
				message: string;
				variant: "success" | "error" | "info";
			}> = [];

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						onNotification={(message, variant) => {
							notifications.push({ message, variant });
						}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Component should render without errors
			expect(lastFrame()).toContain("Settings");
			// No notifications should be sent on initial render
			expect(notifications.length).toBe(0);
			unmount();
		});
	});

	describe("cursor indicator", () => {
		it("should show cursor indicator > for focused item", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain(">");
			unmount();
		});

		it("should show cursor on first setting by default", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			const frame = lastFrame() || "";
			// The cursor should appear before "Explicit Content Filter"
			expect(frame).toContain(">");
			expect(frame).toContain("Explicit Content Filter");
			unmount();
		});
	});

	describe("help text", () => {
		it("should show 'Press Escape to close' when no changes pending", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Press Escape to close");
			unmount();
		});
	});

	describe("panel structure", () => {
		it("should be wrapped in a Panel component", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Panel should render with border characters (box drawing)
			const frame = lastFrame() || "";
			// Panels typically use box drawing characters like ╭, ╮, ╰, ╯, │, ─
			expect(
				frame.includes("─") || frame.includes("│") || frame.includes("┐"),
			).toBe(true);
			unmount();
		});
	});

	describe("visibility changes", () => {
		it("should reset state when becoming visible", async () => {
			const { rerender, lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={false}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			// Initially not visible
			expect(lastFrame()).toBe("");

			// Become visible
			rerender(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			// Should now be visible with content
			expect(lastFrame()).toContain("Settings");
			unmount();
		});
	});

	describe("unknown username handling", () => {
		it("should show 'Unknown' when username is not provided", async () => {
			mockGetSettings.mockImplementation(() =>
				Effect.succeed({
					username: undefined,
					isExplicitContentFilterEnabled: false,
					isProfilePrivate: true,
					emailOptIn: false,
					zipCode: "90210",
				}),
			);

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Unknown");
			unmount();
		});
	});

	describe("zip code display", () => {
		it("should show 'Not set' when zip code is empty", async () => {
			mockGetSettings.mockImplementation(() =>
				Effect.succeed({
					username: "user@example.com",
					isExplicitContentFilterEnabled: false,
					isProfilePrivate: true,
					emailOptIn: false,
					zipCode: "",
				}),
			);

			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("Not set");
			unmount();
		});

		it("should display the zip code value when set", async () => {
			const { lastFrame, unmount } = render(
				<ThemedWrapper>
					<SettingsView
						isVisible={true}
						onClose={() => {}}
						authState={mockAuthState}
					/>
				</ThemedWrapper>,
			);

			await waitForAsync();

			expect(lastFrame()).toContain("90210");
			unmount();
		});
	});
});

describe("SettingsView with different settings configurations", () => {
	beforeEach(() => {
		mockGetSettings.mockClear();
		mockChangeSettings.mockClear();
	});

	it("should handle all settings enabled", async () => {
		mockGetSettings.mockImplementation(() =>
			Effect.succeed({
				username: "power@user.com",
				isExplicitContentFilterEnabled: true,
				isProfilePrivate: true,
				emailOptIn: true,
				zipCode: "10001",
			}),
		);

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<SettingsView
					isVisible={true}
					onClose={() => {}}
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await waitForAsync();

		const frame = lastFrame() || "";
		expect(frame).toContain("power@user.com");
		expect(frame).toContain("10001");

		// All three toggle settings should show [ON]
		const onMatches = frame.match(/\[ON\]/g);
		expect(onMatches?.length).toBe(3);
		unmount();
	});

	it("should handle all settings disabled", async () => {
		mockGetSettings.mockImplementation(() =>
			Effect.succeed({
				username: "minimal@user.com",
				isExplicitContentFilterEnabled: false,
				isProfilePrivate: false,
				emailOptIn: false,
				zipCode: "",
			}),
		);

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<SettingsView
					isVisible={true}
					onClose={() => {}}
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await waitForAsync();

		const frame = lastFrame() || "";
		expect(frame).toContain("minimal@user.com");
		expect(frame).toContain("Not set");

		// All three toggle settings should show [OFF]
		const offMatches = frame.match(/\[OFF\]/g);
		expect(offMatches?.length).toBe(3);
		unmount();
	});

	it("should handle mixed settings state", async () => {
		mockGetSettings.mockImplementation(() =>
			Effect.succeed({
				username: "mixed@user.com",
				isExplicitContentFilterEnabled: true,
				isProfilePrivate: false,
				emailOptIn: true,
				zipCode: "55555",
			}),
		);

		const { lastFrame, unmount } = render(
			<ThemedWrapper>
				<SettingsView
					isVisible={true}
					onClose={() => {}}
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await waitForAsync();

		const frame = lastFrame() || "";
		expect(frame).toContain("mixed@user.com");
		expect(frame).toContain("55555");

		// Should have mix of [ON] and [OFF]
		const onMatches = frame.match(/\[ON\]/g);
		const offMatches = frame.match(/\[OFF\]/g);
		expect(onMatches?.length).toBe(2); // explicit + email
		expect(offMatches?.length).toBe(1); // profile privacy
		unmount();
	});
});

describe("SettingsView API interactions", () => {
	beforeEach(() => {
		mockGetSettings.mockClear();
		mockChangeSettings.mockClear();

		mockGetSettings.mockImplementation(() =>
			Effect.succeed({
				username: "user@example.com",
				isExplicitContentFilterEnabled: false,
				isProfilePrivate: true,
				emailOptIn: false,
				zipCode: "90210",
			}),
		);
	});

	it("should call getSettings when becoming visible", async () => {
		const { unmount } = render(
			<ThemedWrapper>
				<SettingsView
					isVisible={true}
					onClose={() => {}}
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await waitForAsync();

		expect(mockGetSettings).toHaveBeenCalled();
		unmount();
	});

	it("should not call getSettings when not visible", async () => {
		const { unmount } = render(
			<ThemedWrapper>
				<SettingsView
					isVisible={false}
					onClose={() => {}}
					authState={mockAuthState}
				/>
			</ThemedWrapper>,
		);

		await waitForAsync();

		expect(mockGetSettings).not.toHaveBeenCalled();
		unmount();
	});
});
