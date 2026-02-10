import { useState, useRef, useCallback, type ReactNode } from "react";

type EditableTextProps = {
	readonly value: string;
	readonly onSave: (newValue: string) => void;
	readonly disabled?: boolean;
	readonly className?: string;
	readonly inputClassName?: string;
	readonly children: ReactNode;
};

export function EditableText({
	value,
	onSave,
	disabled,
	className,
	inputClassName,
	children,
}: EditableTextProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState(value);
	const inputRef = useRef<HTMLInputElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressTriggered = useRef(false);

	const enterEditMode = useCallback(() => {
		setEditValue(value);
		setIsEditing(true);
		requestAnimationFrame(() => {
			inputRef.current?.select();
		});
	}, [value]);

	const handleSave = useCallback(() => {
		const trimmed = editValue.trim();
		setIsEditing(false);
		if (trimmed && trimmed !== value) {
			onSave(trimmed);
		}
	}, [editValue, value, onSave]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				handleSave();
			} else if (e.key === "Escape") {
				setIsEditing(false);
			}
		},
		[handleSave],
	);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (disabled) return;
			longPressTriggered.current = false;
			timerRef.current = setTimeout(() => {
				longPressTriggered.current = true;
				enterEditMode();
			}, 500);
		},
		[disabled, enterEditMode],
	);

	const handlePointerUp = useCallback(
		(e: React.PointerEvent) => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			if (longPressTriggered.current) {
				e.stopPropagation();
			}
		},
		[],
	);

	const handlePointerCancel = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const handleDoubleClick = useCallback(
		(e: React.MouseEvent) => {
			if (disabled) return;
			e.stopPropagation();
			enterEditMode();
		},
		[disabled, enterEditMode],
	);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			if (!disabled) {
				e.preventDefault();
			}
		},
		[disabled],
	);

	if (isEditing) {
		return (
			<input
				ref={inputRef}
				type="text"
				value={editValue}
				onChange={(e) => setEditValue(e.target.value)}
				onBlur={handleSave}
				onKeyDown={handleKeyDown}
				className={`${className ?? ""} ${inputClassName ?? ""} bg-transparent border border-[var(--color-primary)] rounded px-1 outline-none`}
			/>
		);
	}

	return (
		<div
			onPointerDown={handlePointerDown}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerCancel}
			onDoubleClick={handleDoubleClick}
			onContextMenu={handleContextMenu}
			className={className}
		>
			{children}
		</div>
	);
}
