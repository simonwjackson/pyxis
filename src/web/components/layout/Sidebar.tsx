import { type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
	Radio,
	Search,
	Bookmark,
	LayoutGrid,
	Settings,
	LogOut,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { trpc } from "../../lib/trpc";

type NavItem = {
	readonly label: string;
	readonly path: string;
	readonly icon: ReactNode;
};

const navItems: readonly NavItem[] = [
	{ label: "Stations", path: "/", icon: <Radio className="w-5 h-5" /> },
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
	const navigate = useNavigate();
	const logoutMutation = trpc.auth.logout.useMutation({
		onSuccess() {
			navigate({ to: "/login" });
		},
	});

	return (
		<aside className="hidden md:flex md:w-56 flex-col bg-zinc-950 border-r border-zinc-800" aria-label="Main navigation">
			<div className="p-4 border-b border-zinc-800">
				<Link to="/" className="text-xl font-bold text-cyan-400">
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
								? "bg-zinc-800 text-cyan-400"
								: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
						)}
					>
						{item.icon}
						<span>{item.label}</span>
					</Link>
				))}
			</nav>
			<div className="p-4 border-t border-zinc-800">
				<button
					onClick={() => logoutMutation.mutate()}
					className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
					type="button"
				>
					<LogOut className="w-4 h-4" />
					Sign out
				</button>
			</div>
		</aside>
	);
}
