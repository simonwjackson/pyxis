import { useCallback, useEffect, useState, type RefObject } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { themeNames, themes } from "@/web/shared/lib/themes";
import { CommandPaletteSelectableItem } from "./CommandPaletteSelectableItem";

type CommandPaletteThemeListPanelProps = {
	readonly listRef: RefObject<HTMLDivElement | null>;
	readonly currentTheme: string;
	readonly onSelect: (name: string) => void;
	readonly onBack: () => void;
	readonly onClose: () => void;
	readonly query: string;
};

export function CommandPaletteThemeListPanel({
	listRef,
	currentTheme,
	onSelect,
	onBack,
	onClose,
	query,
}: CommandPaletteThemeListPanelProps) {
	const [selectedIndex, setSelectedIndex] = useState(() =>
		Math.max(themeNames.indexOf(currentTheme), 0),
	);

	useEffect(() => {
		setSelectedIndex(Math.max(themeNames.indexOf(currentTheme), 0));
	}, [currentTheme]);

	useEffect(() => {
		const list = listRef.current;
		if (!list) return;
		const selected = list.querySelector("[data-selected='true']");
		if (selected) {
			selected.scrollIntoView({ block: "nearest" });
		}
	}, [selectedIndex, listRef]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setSelectedIndex((index) => Math.min(index + 1, themeNames.length - 1));
			} else if (event.key === "ArrowUp") {
				event.preventDefault();
				setSelectedIndex((index) => Math.max(index - 1, 0));
			} else if (event.key === "Enter") {
				event.preventDefault();
				const name = themeNames[selectedIndex];
				if (name) {
					onSelect(name);
				}
			} else if (event.key === "Escape") {
				event.preventDefault();
				onClose();
			} else if (event.key === "Backspace" && query.length === 0) {
				event.preventDefault();
				onBack();
			}
		},
		[selectedIndex, onSelect, onBack, onClose, query.length],
	);

	return (
		<div onKeyDown={handleKeyDown}>
			<button
				type="button"
				onClick={onBack}
				className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-bg-highlight)] text-left text-[var(--color-text-dim)]"
			>
				<ArrowLeft className="w-4 h-4" />
				<span className="text-[0.98rem] font-light tracking-[-0.02em] lowercase">
					back to commands
				</span>
			</button>

			<div className="px-3 py-1 mt-1">
				<p className="zune-label text-[var(--color-text-dim)]">themes</p>
			</div>

			{themeNames.map((name, index) => {
				const theme = themes[name];
				if (!theme) return null;
				const isSelected = index === selectedIndex;
				const isActive = name === currentTheme;
				return (
					<CommandPaletteSelectableItem
						key={name}
						selected={isSelected}
						onClick={() => onSelect(name)}
						onMouseEnter={() => setSelectedIndex(index)}
					>
						<div className="w-4 h-4 shrink-0" style={{ background: theme.gradient }} />
						<span className={`flex-1 text-[0.98rem] font-light tracking-[-0.02em] lowercase ${isSelected ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
							{theme.label}
						</span>
						{isActive ? <Check className="w-4 h-4 text-[var(--color-primary)]" /> : null}
					</CommandPaletteSelectableItem>
				);
			})}
		</div>
	);
}
