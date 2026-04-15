export function CommandPaletteFooter() {
	return (
		<div className="zune-label flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] text-[var(--color-text-dim)]">
			<div className="flex gap-3">
				<span>
					<kbd className="px-1 bg-[var(--color-bg-highlight)] border border-[var(--color-border)]">&uarr;&darr;</kbd>{" "}
					navigate
				</span>
				<span>
					<kbd className="px-1 bg-[var(--color-bg-highlight)] border border-[var(--color-border)]">&crarr;</kbd>{" "}
					select
				</span>
				<span>
					<kbd className="px-1 bg-[var(--color-bg-highlight)] border border-[var(--color-border)]">esc</kbd>{" "}
					close
				</span>
			</div>
		</div>
	);
}
