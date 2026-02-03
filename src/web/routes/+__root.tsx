import { useState, useCallback } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/web/shared/layout/sidebar";
import { MobileNav } from "@/web/shared/layout/mobile-nav";
import { NowPlayingBar } from "@/web/shared/layout/now-playing-bar";
import { CommandPalette } from "@/web/shared/layout/command-palette";
import { useKeyboardShortcuts } from "@/web/shared/keyboard-shortcuts";

function RootLayout() {
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

	const handleCommandPalette = useCallback(() => {
		setCommandPaletteOpen((prev) => !prev);
	}, []);

	const handleToggleHelp = useCallback(() => {
		setCommandPaletteOpen(true);
	}, []);

	useKeyboardShortcuts({
		onCommandPalette: handleCommandPalette,
		onToggleHelp: handleToggleHelp,
	});

	return (
		<div className="flex h-screen bg-[var(--color-bg)] text-[var(--color-text)] safe-left safe-right">
			<Sidebar />
			<div className="flex-1 flex flex-col min-w-0">
				<MobileNav />
				<main className="flex-1 overflow-y-auto pb-32">
					<Outlet />
				</main>
				<NowPlayingBar />
			</div>
			{commandPaletteOpen && (
				<CommandPalette
					onClose={() => setCommandPaletteOpen(false)}
				/>
			)}
		</div>
	);
}

export const Route = createRootRoute({
	component: RootLayout,
});
