import { Box, Text, useInput } from "ink";
import { Spinner } from "@inkjs/ui";
import { type FC, useState, useCallback, useEffect, useRef } from "react";
import { Effect } from "effect";
import { useTheme } from "../../theme/provider.js";
import { Panel } from "../layout/index.js";
import { getSettings, changeSettings } from "../../../client.js";
import { getSession } from "../../../cli/cache/session.js";
import type {
	GetSettingsResponse,
	ChangeSettingsRequest,
} from "../../../types/api.js";

type SettingsViewProps = {
	readonly isVisible: boolean;
	readonly onClose: () => void;
	readonly onNotification?: (
		message: string,
		variant: "success" | "error" | "info",
	) => void;
	readonly authState?: {
		readonly syncTime: number;
		readonly partnerId: string;
		readonly partnerAuthToken: string;
		readonly userAuthToken: string;
		readonly userId: string;
	};
};

type LoadingState =
	| { readonly status: "idle" }
	| { readonly status: "loading" }
	| { readonly status: "success"; readonly data: GetSettingsResponse }
	| { readonly status: "error"; readonly message: string };

type ToggleSettingKey =
	| "isExplicitContentFilterEnabled"
	| "isProfilePrivate"
	| "emailOptIn";

type SettingItem =
	| {
			readonly type: "toggle";
			readonly key: ToggleSettingKey;
			readonly label: string;
	  }
	| {
			readonly type: "display";
			readonly key: keyof GetSettingsResponse;
			readonly label: string;
	  };

const SETTINGS_ITEMS: readonly SettingItem[] = [
	{
		type: "toggle",
		key: "isExplicitContentFilterEnabled",
		label: "Explicit Content Filter",
	},
	{ type: "toggle", key: "isProfilePrivate", label: "Profile Privacy" },
	{ type: "toggle", key: "emailOptIn", label: "Email Notifications" },
	{ type: "display", key: "zipCode", label: "Zip Code" },
] as const;

/**
 * Settings View - View and modify user settings
 *
 * Layout:
 * ```
 * Settings
 * ╭──────────────────────────────────────────────────────────────────────────╮
 * │  Account                                                                 │
 * │    user@example.com                                                      │
 * │                                                                          │
 * │  Preferences                                                             │
 * │  > Explicit Content Filter          [OFF]                                │
 * │    Profile Privacy                  [ON]                                 │
 * │    Email Notifications              [OFF] *modified                      │
 * │    Zip Code                         90210                                │
 * │                                                                          │
 * │  Press 's' to save, Escape to cancel                                    │
 * ╰──────────────────────────────────────────────────────────────────────────╯
 * ```
 *
 * Features:
 * - j/k navigation
 * - Space/Enter to toggle boolean settings
 * - s to save changes
 * - Esc to go back (warns if unsaved changes)
 * - g/G to jump to first/last
 */
export const SettingsView: FC<SettingsViewProps> = ({
	isVisible,
	onClose,
	onNotification,
	authState,
}) => {
	const theme = useTheme();
	const [loadingState, setLoadingState] = useState<LoadingState>({
		status: "idle",
	});
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [pendingChanges, setPendingChanges] = useState<ChangeSettingsRequest>(
		{},
	);
	const [hasChanges, setHasChanges] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const pendingCloseRef = useRef(false);

	// Fetch settings when view becomes visible
	useEffect(() => {
		if (!isVisible) {
			return;
		}

		const fetchSettings = async () => {
			setLoadingState({ status: "loading" });

			try {
				const session = authState ?? (await getSession());
				if (!session) {
					setLoadingState({ status: "error", message: "Not logged in" });
					return;
				}

				const result = await Effect.runPromise(
					getSettings(session).pipe(Effect.either),
				);

				if (result._tag === "Right") {
					setLoadingState({ status: "success", data: result.right });
					setSelectedIndex(0);
					setPendingChanges({});
					setHasChanges(false);
				} else {
					setLoadingState({
						status: "error",
						message: "Failed to load settings",
					});
				}
			} catch {
				setLoadingState({ status: "error", message: "An error occurred" });
			}
		};

		fetchSettings();
	}, [isVisible, authState]);

	// Get current value for a setting (pending change or original)
	const getCurrentValue = useCallback(
		(key: keyof GetSettingsResponse): boolean | string | number | undefined => {
			if (loadingState.status !== "success") return undefined;

			// Check if there's a pending change for this key
			if (key in pendingChanges) {
				return pendingChanges[key as keyof ChangeSettingsRequest];
			}

			// Return original value
			return loadingState.data[key];
		},
		[loadingState, pendingChanges],
	);

	// Check if a setting has been modified
	const isModified = useCallback(
		(key: ToggleSettingKey): boolean => {
			return key in pendingChanges;
		},
		[pendingChanges],
	);

	// Toggle a boolean setting
	const toggleSetting = useCallback(
		(key: ToggleSettingKey) => {
			if (loadingState.status !== "success") return;

			const currentValue =
				(pendingChanges[key] as boolean | undefined) ??
				(loadingState.data[key] as boolean | undefined);

			setPendingChanges((prev) => ({
				...prev,
				[key]: !currentValue,
			}));
			setHasChanges(true);
		},
		[loadingState, pendingChanges],
	);

	// Save pending changes
	const handleSave = useCallback(async () => {
		if (!hasChanges || isSaving) return;

		setIsSaving(true);
		onNotification?.("Saving settings...", "info");

		try {
			const session = authState ?? (await getSession());
			if (!session) {
				onNotification?.("Not logged in", "error");
				setIsSaving(false);
				return;
			}

			const result = await Effect.runPromise(
				changeSettings(session, pendingChanges).pipe(Effect.either),
			);

			if (result._tag === "Right") {
				// Update local state with new values
				if (loadingState.status === "success") {
					setLoadingState({
						status: "success",
						data: { ...loadingState.data, ...pendingChanges },
					});
				}
				setPendingChanges({});
				setHasChanges(false);
				onNotification?.("Settings saved", "success");
			} else {
				onNotification?.("Failed to save settings", "error");
			}
		} catch {
			onNotification?.("An error occurred", "error");
		} finally {
			setIsSaving(false);
		}
	}, [
		hasChanges,
		isSaving,
		pendingChanges,
		loadingState,
		authState,
		onNotification,
	]);

	// Handle close with unsaved changes warning
	const handleClose = useCallback(() => {
		if (hasChanges && !pendingCloseRef.current) {
			pendingCloseRef.current = true;
			onNotification?.(
				"Unsaved changes! Press Escape again to discard",
				"info",
			);
			return;
		}
		pendingCloseRef.current = false;
		onClose();
	}, [hasChanges, onClose, onNotification]);

	// Reset pending close flag when changes are made
	useEffect(() => {
		if (hasChanges) {
			pendingCloseRef.current = false;
		}
	}, [hasChanges]);

	// Handle keyboard input
	useInput(
		(input, key) => {
			if (key.escape) {
				handleClose();
				return;
			}

			if (loadingState.status !== "success" || isSaving) return;

			const toggleItems = SETTINGS_ITEMS.filter(
				(item) => item.type === "toggle",
			);
			const maxIndex = toggleItems.length - 1;

			// Navigation
			if (input === "j" || key.downArrow) {
				setSelectedIndex((prev) => Math.min(prev + 1, maxIndex));
				return;
			}
			if (input === "k" || key.upArrow) {
				setSelectedIndex((prev) => Math.max(prev - 1, 0));
				return;
			}
			if (input === "g") {
				setSelectedIndex(0);
				return;
			}
			if (input === "G") {
				setSelectedIndex(maxIndex);
				return;
			}

			// Toggle selected setting
			if (input === " " || key.return) {
				const selectedItem = toggleItems[selectedIndex];
				if (selectedItem?.type === "toggle") {
					toggleSetting(selectedItem.key);
				}
				return;
			}

			// Save
			if (input === "s") {
				handleSave();
				return;
			}
		},
		{ isActive: isVisible },
	);

	if (!isVisible) {
		return null;
	}

	const toggleItems = SETTINGS_ITEMS.filter((item) => item.type === "toggle");
	const displayItems = SETTINGS_ITEMS.filter((item) => item.type === "display");

	const formatToggleValue = (value: boolean | undefined): string => {
		return value ? "[ON]" : "[OFF]";
	};

	const formatDisplayValue = (
		value: string | number | boolean | undefined,
	): string => {
		if (value === undefined || value === null || value === "") {
			return "Not set";
		}
		return String(value);
	};

	return (
		<Box flexDirection="column" flexGrow={1} marginX={1}>
			<Panel title="Settings" flexGrow={1}>
				<Box flexDirection="column">
					{/* Loading state */}
					{loadingState.status === "loading" && (
						<Box>
							<Spinner label="Loading settings..." />
						</Box>
					)}

					{/* Error state */}
					{loadingState.status === "error" && (
						<Text color={theme.colors.error}>{loadingState.message}</Text>
					)}

					{/* Saving indicator */}
					{isSaving && (
						<Box>
							<Spinner label="Saving..." />
						</Box>
					)}

					{/* Success state */}
					{loadingState.status === "success" && !isSaving && (
						<>
							{/* Account section */}
							<Box flexDirection="column" marginBottom={1}>
								<Text color={theme.colors.accent} bold>
									Account
								</Text>
								<Box paddingLeft={2}>
									<Text color={theme.colors.textMuted}>
										{loadingState.data.username ?? "Unknown"}
									</Text>
								</Box>
							</Box>

							{/* Preferences section - toggleable items */}
							<Box flexDirection="column" marginBottom={1}>
								<Text color={theme.colors.accent} bold>
									Preferences
								</Text>
								{toggleItems.map((item, idx) => {
									const isSelected = idx === selectedIndex;
									const value = getCurrentValue(item.key) as
										| boolean
										| undefined;
									const modified = isModified(item.key);

									return (
										<Box key={item.key}>
											<Text
												color={
													isSelected
														? theme.colors.accent
														: theme.colors.textMuted
												}
											>
												{isSelected ? "> " : "  "}
											</Text>
											<Box width={32}>
												<Text
													color={
														isSelected
															? theme.colors.text
															: theme.colors.secondary
													}
													bold={isSelected}
												>
													{item.label}
												</Text>
											</Box>
											<Text
												color={
													value ? theme.colors.success : theme.colors.error
												}
												bold
											>
												{formatToggleValue(value)}
											</Text>
											{modified && (
												<Text color={theme.colors.warning}> *modified</Text>
											)}
										</Box>
									);
								})}
							</Box>

							{/* Display-only items */}
							{displayItems.length > 0 && (
								<Box flexDirection="column" marginBottom={1}>
									{displayItems.map((item) => {
										const value = getCurrentValue(item.key) as
											| string
											| undefined;

										return (
											<Box key={item.key}>
												<Text color={theme.colors.textMuted}>{"  "}</Text>
												<Box width={32}>
													<Text color={theme.colors.secondary}>
														{item.label}
													</Text>
												</Box>
												<Text color={theme.colors.textMuted}>
													{formatDisplayValue(value)}
												</Text>
											</Box>
										);
									})}
								</Box>
							)}

							{/* Help text */}
							<Box marginTop={1}>
								<Text color={theme.colors.textMuted}>
									{hasChanges
										? "Press 's' to save, Escape to cancel"
										: "Press Escape to close"}
								</Text>
							</Box>
						</>
					)}
				</Box>
			</Panel>
		</Box>
	);
};

export type { SettingsViewProps };
