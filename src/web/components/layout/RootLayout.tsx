import { Outlet, useRouterState } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { NowPlayingBar } from "./NowPlayingBar";
import { usePlayback } from "../../hooks/usePlayback";

export function RootLayout() {
	const { location } = useRouterState();
	const isLoginPage = location.pathname === "/login";
	const playback = usePlayback();

	if (isLoginPage) {
		return <Outlet />;
	}

	return (
		<div className="flex h-screen bg-zinc-900 text-zinc-100">
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
				/>
			</div>
		</div>
	);
}
