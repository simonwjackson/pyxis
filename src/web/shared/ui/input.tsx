/**
 * @module Input
 * Reusable text input component with consistent styling.
 */

import { forwardRef } from "react";
import { cn } from "../lib/utils";

/**
 * Props for the Input component.
 * Extends native input attributes.
 */
type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Text input component with consistent styling and focus states.
 * Should be paired with a label for accessibility.
 *
 * @example
 * ```tsx
 * <label htmlFor="search">Search</label>
 * <Input id="search" placeholder="Search..." />
 * ```
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
	({ className, type = "text", ...props }, ref) => (
		<input
			ref={ref}
			type={type}
			className={cn(
				"flex h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-highlight)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-active)] disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	),
);
Input.displayName = "Input";
