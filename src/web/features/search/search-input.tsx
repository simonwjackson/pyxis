/**
 * @module SearchInput
 * Debounced search input component.
 */

import { useState, useEffect, useRef, useId } from "react";
import { Input } from "@/web/shared/ui/input";

/**
 * Props for the SearchInput component.
 */
type SearchInputProps = {
	/** Callback fired with the search query after debounce */
	readonly onSearch: (query: string) => void;
	/** Placeholder text for the input. Default: "Search..." */
	readonly placeholder?: string;
	/** Debounce delay in milliseconds. Default: 300 */
	readonly debounceMs?: number;
	/** Accessible label for the search input */
	readonly ariaLabel?: string;
};

/**
 * Debounced search input that triggers onSearch after the user stops typing.
 * Includes proper accessibility labeling via aria-label.
 *
 * @example
 * ```tsx
 * <SearchInput
 *   onSearch={(query) => console.log(query)}
 *   ariaLabel="Search music"
 * />
 * ```
 */
export function SearchInput({
	onSearch,
	placeholder = "Search...",
	debounceMs = 300,
	ariaLabel = "Search",
}: SearchInputProps) {
	const [value, setValue] = useState("");
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inputId = useId();

	useEffect(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => {
			onSearch(value);
		}, debounceMs);

		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [value, debounceMs, onSearch]);

	return (
		<>
			<label htmlFor={inputId} className="sr-only">
				{ariaLabel}
			</label>
			<Input
				id={inputId}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder={placeholder}
				aria-label={ariaLabel}
			/>
		</>
	);
}
