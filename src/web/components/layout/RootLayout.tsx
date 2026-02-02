import { useState, useCallback } from "react";
import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { NowPlayingBar } from "./NowPlayingBar";
import { CommandPalette } from "../overlays/CommandPalette";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

export function RootLayout() {
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
				<main className="flex-1 overflow-y-auto pb-20">
					<Outlet />
				</main>
				<NowPlayingBar />
			</div>
			<CommandPalette
				isOpen={commandPaletteOpen}
				onClose={() => setCommandPaletteOpen(false)}
			/>
		</div>
	);
}
