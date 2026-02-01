import { useEffect, useState, useCallback } from "react";
import { Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { NowPlayingBar } from "./NowPlayingBar";
import { CommandPalette } from "../overlays/CommandPalette";
import { usePlaybackContext } from "../../contexts/PlaybackContext";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { trpc } from "../../lib/trpc";

export function RootLayout() {
	const { location } = useRouterState();
	const navigate = useNavigate();
	const isLoginPage = location.pathname === "/login";
	const playback = usePlaybackContext();
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

	const authStatus = trpc.auth.status.useQuery(undefined, {
		retry: false,
		refetchOnWindowFocus: false,
	});

	const handleCommandPalette = useCallback(() => {
		setCommandPaletteOpen((prev) => !prev);
	}, []);

	const handleToggleHelp = useCallback(() => {
		// Help opens the command palette as a shortcut reference
		setCommandPaletteOpen(true);
	}, []);

	useKeyboardShortcuts({
		onCommandPalette: handleCommandPalette,
		onToggleHelp: handleToggleHelp,
	});

	// Redirect to login if not authenticated
	useEffect(() => {
		if (
			!authStatus.isLoading &&
			!authStatus.isFetching &&
			!authStatus.data?.authenticated &&
			!isLoginPage
		) {
			navigate({ to: "/login" });
		}
	}, [authStatus.isLoading, authStatus.isFetching, authStatus.data?.authenticated, isLoginPage, navigate]);

	if (isLoginPage) {
		return <Outlet />;
	}

	return (
		<div className="flex h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
			<Sidebar />
			<div className="flex-1 flex flex-col min-w-0">
				<MobileNav />
				<main className="flex-1 overflow-y-auto pb-20">
					<Outlet />
				</main>
				<NowPlayingBar
					currentTrack={playback.currentTrack}
					isPlaying={playback.isPlaying}
					progress={playback.progress}
					duration={playback.duration}
					onTogglePlayPause={playback.togglePlayPause}
					onSkip={playback.triggerSkip}
				/>
			</div>
			<CommandPalette
				isOpen={commandPaletteOpen}
				onClose={() => setCommandPaletteOpen(false)}
			/>
		</div>
	);
}
