import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "../../lib/utils";

type NavItem = {
	readonly label: string;
	readonly path: string;
	readonly icon: string;
};

const navItems: readonly NavItem[] = [
	{ label: "Stations", path: "/", icon: "📻" },
	{ label: "Search", path: "/search", icon: "🔍" },
	{ label: "Bookmarks", path: "/bookmarks", icon: "🔖" },
	{ label: "Genres", path: "/genres", icon: "🎵" },
	{ label: "Settings", path: "/settings", icon: "⚙️" },
];

export function Sidebar() {
	const { location } = useRouterState();

	return (
		<aside className="hidden md:flex md:w-56 flex-col bg-zinc-950 border-r border-zinc-800">
			<div className="p-4">
				<Link to="/" className="text-xl font-bold text-cyan-400">
					pyxis
				</Link>
			</div>
			<nav className="flex-1 px-2 space-y-1">
				{navItems.map((item) => (
					<Link
						key={item.path}
						to={item.path}
						className={cn(
							"flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
							location.pathname === item.path
								? "bg-zinc-800 text-cyan-400"
								: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
						)}
					>
						<span>{item.icon}</span>
						<span>{item.label}</span>
					</Link>
				))}
			</nav>
		</aside>
	);
}
