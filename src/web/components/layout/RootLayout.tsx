import { useEffect } from "react";
import { Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { NowPlayingBar } from "./NowPlayingBar";
import { usePlaybackContext } from "../../contexts/PlaybackContext";
import { trpc } from "../../lib/trpc";

export function RootLayout() {
	const { location } = useRouterState();
	const navigate = useNavigate();
	const isLoginPage = location.pathname === "/login";
	const playback = usePlaybackContext();

	const authStatus = trpc.auth.status.useQuery(undefined, {
		retry: false,
		refetchOnWindowFocus: false,
	});

	// Redirect to login if not authenticated
	useEffect(() => {
		if (
			!authStatus.isLoading &&
			!authStatus.data?.authenticated &&
			!isLoginPage
		) {
			navigate({ to: "/login" });
		}
	}, [authStatus.isLoading, authStatus.data?.authenticated, isLoginPage, navigate]);

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
					onSkip={playback.triggerSkip}
				/>
			</div>
		</div>
	);
}
