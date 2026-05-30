import {
  createRootRoute,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useKeyboardShortcuts } from "@app/shared/keyboard-shortcuts";
import { CommandPalette } from "@app/shared/layout/command-palette";
import { MobileNav } from "@app/shared/layout/mobile-nav";
import { NowPlayingBar } from "@app/shared/layout/now-playing-bar";
import { Sidebar } from "@app/shared/layout/sidebar";
import { ErrorBoundary } from "@app/shared/ui/error-boundary";

function AppShell() {
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
        <main className="flex-1 overflow-y-auto pb-40">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
        <NowPlayingBar />
      </div>
      {commandPaletteOpen && (
        <CommandPalette onClose={() => setCommandPaletteOpen(false)} />
      )}
    </div>
  );
}

function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname.startsWith("/sandbox")) {
    return <Outlet />;
  }

  return <AppShell />;
}

export const Route = createRootRoute({
  component: RootLayout,
});
