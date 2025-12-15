// Truncate text with ellipsis if too long
export const truncate = (text: string, maxLength: number): string => {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength - 1) + "…";
};

// Format duration in seconds to mm:ss
export const formatDuration = (seconds: number): string => {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${String(secs).padStart(2, "0")}`;
};

// Pad string to fixed width
export const padEnd = (text: string, width: number): string => {
	if (text.length >= width) return text.slice(0, width);
	return text + " ".repeat(width - text.length);
};

// Pad string to center
export const center = (text: string, width: number): string => {
	if (text.length >= width) return text;
	const padding = Math.floor((width - text.length) / 2);
	return " ".repeat(padding) + text + " ".repeat(width - text.length - padding);
};
