import { useState, useEffect, useRef } from "react";
import { Input } from "../ui/input";

type SearchInputProps = {
	readonly onSearch: (query: string) => void;
	readonly placeholder?: string;
	readonly debounceMs?: number;
};

export function SearchInput({
	onSearch,
	placeholder = "Search...",
	debounceMs = 300,
}: SearchInputProps) {
	const [value, setValue] = useState("");
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
		<Input
			value={value}
			onChange={(e) => setValue(e.target.value)}
			placeholder={placeholder}
		/>
	);
}
