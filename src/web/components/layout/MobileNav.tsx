import { useState } from "react";
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

export function MobileNav() {
	const [isOpen, setIsOpen] = useState(false);
	const { location } = useRouterState();

	return (
		<div className="md:hidden">
			<div className="flex items-center justify-between p-4 border-b border-zinc-800">
				<Link to="/" className="text-xl font-bold text-cyan-400">
					pyxis
				</Link>
				<button
					onClick={() => setIsOpen(!isOpen)}
					className="text-zinc-400 hover:text-zinc-200"
					type="button"
				>
					{isOpen ? "✕" : "☰"}
				</button>
			</div>
			{isOpen && (
				<div className="absolute inset-x-0 top-14 z-50 bg-zinc-950 border-b border-zinc-800 shadow-lg">
					<nav className="p-2 space-y-1">
						{navItems.map((item) => (
							<Link
								key={item.path}
								to={item.path}
								onClick={() => setIsOpen(false)}
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
				</div>
			)}
		</div>
	);
}
