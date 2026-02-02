import { type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	Home,
	Radio,
	Search,
	Bookmark,
	LayoutGrid,
	Settings,
} from "lucide-react";
import { cn } from "../lib/utils";

type NavItem = {
	readonly label: string;
	readonly path: string;
	readonly icon: ReactNode;
};

const navItems: readonly NavItem[] = [
	{ label: "Home", path: "/", icon: <Home className="w-5 h-5" /> },
	{ label: "Stations", path: "/stations", icon: <Radio className="w-5 h-5" /> },
	{ label: "Search", path: "/search", icon: <Search className="w-5 h-5" /> },
	{
		label: "Bookmarks",
		path: "/bookmarks",
		icon: <Bookmark className="w-5 h-5" />,
	},
	{
		label: "Genres",
		path: "/genres",
		icon: <LayoutGrid className="w-5 h-5" />,
	},
	{
		label: "Settings",
		path: "/settings",
		icon: <Settings className="w-5 h-5" />,
	},
];

export function Sidebar() {
	const { location } = useRouterState();

	return (
		<aside className="hidden md:flex md:w-56 flex-col bg-[var(--color-bg-panel)] border-r border-[var(--color-border)]" aria-label="Main navigation">
			<div className="p-4 border-b border-[var(--color-border)]">
				<Link to="/" className="text-xl font-bold text-[var(--color-primary)]">
					pyxis
				</Link>
			</div>
			<nav className="flex-1 px-2 py-2 space-y-1">
				{navItems.map((item) => (
					<Link
						key={item.path}
						to={item.path}
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
		</aside>
	);
}
