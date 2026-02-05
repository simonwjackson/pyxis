/**
 * @module Spinner
 * Loading spinner component with accessibility support.
 */

import { cn } from "../lib/utils";

/**
 * Props for the Spinner component.
 */
type SpinnerProps = {
	readonly className?: string;
	/** Accessible label for screen readers. Defaults to "Loading" */
	readonly label?: string;
};

/**
 * Animated loading spinner with accessibility support.
 * @param props - Spinner props including optional className and label
 */
export function Spinner({ className, label = "Loading" }: SpinnerProps) {
	return (
		<svg
			className={cn("h-5 w-5 animate-spin text-[var(--color-primary)]", className)}
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			role="status"
			aria-label={label}
		>
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="4"
			/>
			<path
				className="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
			/>
		</svg>
	);
}
