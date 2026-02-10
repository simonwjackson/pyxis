/**
 * @module MobileNav
 * Mobile navigation header with collapsible menu drawer.
 * Visible only on mobile viewports (< md breakpoint).
 */

import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	Home,
	Radio,
	Search,
	Bookmark,
	LayoutGrid,
	History,
	Settings,
	Menu,
	X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { trpc } from "../lib/trpc";

/**
 * Navigation item configuration.
 */
type NavItem = {
	readonly label: string;
	readonly path: string;
	readonly icon: ReactNode;
	readonly requiresPandora?: boolean;
};

/** All navigation items in display order */
const navItems: readonly NavItem[] = [
	{ label: "Home", path: "/", icon: <Home className="w-5 h-5" /> },
	{ label: "Stations", path: "/stations", icon: <Radio className="w-5 h-5" />, requiresPandora: true },
	{ label: "Search", path: "/search", icon: <Search className="w-5 h-5" /> },
	{
		label: "Bookmarks",
		path: "/bookmarks",
		icon: <Bookmark className="w-5 h-5" />,
		requiresPandora: true,
	},
	{
		label: "Genres",
		path: "/genres",
		icon: <LayoutGrid className="w-5 h-5" />,
		requiresPandora: true,
	},
	{
		label: "History",
		path: "/history",
		icon: <History className="w-5 h-5" />,
	},
	{
		label: "Settings",
		path: "/settings",
		icon: <Settings className="w-5 h-5" />,
	},
];

/**
 * Mobile navigation header with hamburger menu.
 * Reveals a dropdown menu when toggled with proper accessibility attributes.
 */
export function MobileNav() {
	const [isOpen, setIsOpen] = useState(false);
	const { location } = useRouterState();
	const statusQuery = trpc.auth.status.useQuery();
	const hasPandora = statusQuery.data?.hasPandora ?? false;
	const visibleItems = navItems.filter((item) => !item.requiresPandora || hasPandora);

	return (
		<div className="md:hidden">
			<div className="flex items-center justify-between p-4 border-b border-[var(--color-border)] safe-top">
				<Link to="/" className="text-xl font-bold text-[var(--color-primary)]">
					pyxis
				</Link>
				<button
					onClick={() => setIsOpen(!isOpen)}
					className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-highlight)] rounded-lg transition-colors"
					type="button"
					aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
					aria-expanded={isOpen}
				>
					{isOpen ? (
						<X className="w-6 h-6" />
					) : (
						<Menu className="w-6 h-6" />
					)}
				</button>
			</div>
			{isOpen && (
				<div className="absolute inset-x-0 top-14 z-50 bg-[var(--color-bg-panel)] border-b border-[var(--color-border)] shadow-lg">
					<nav className="p-2 space-y-1" aria-label="Mobile navigation">
						{visibleItems.map((item) => (
							<Link
								key={item.path}
								to={item.path}
								onClick={() => setIsOpen(false)}
								className={cn(
									"flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
									location.pathname === item.path
										? "bg-[var(--color-bg-highlight)] text-[var(--color-primary)]"
										: "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-highlight)] hover:text-[var(--color-text)]",
								)}
							>
								{item.icon}
								<span>{item.label}</span>
							</Link>
						))}
					</nav>
				</div>
			)}
		</div>
	);
}
