/**
 * @module Button
 * Reusable button component with variant and size options.
 */

import { forwardRef } from "react";
import { cn } from "../lib/utils";

/** Visual style variant for the button */
type ButtonVariant = "default" | "ghost" | "outline" | "destructive";

/** Size preset for the button */
type ButtonSize = "default" | "sm" | "lg" | "icon";

/**
 * Props for the Button component.
 * Extends native button attributes with variant and size options.
 */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	/** Visual style variant. Default: "default" */
	readonly variant?: ButtonVariant;
	/** Size preset. Default: "default" */
	readonly size?: ButtonSize;
};

const variantStyles: Record<ButtonVariant, string> = {
	default: "bg-[var(--color-primary)] text-white hover:brightness-110",
	ghost: "hover:bg-[var(--color-bg-highlight)] text-[var(--color-text-muted)]",
	outline: "border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-highlight)]",
	destructive: "bg-[var(--color-error)] text-white hover:brightness-110",
};

const sizeStyles: Record<ButtonSize, string> = {
	default: "h-10 px-4 py-2",
	sm: "h-8 px-3 text-sm",
	lg: "h-12 px-6 text-lg",
	icon: "h-10 w-10",
};

/**
 * Button component with customizable variant and size.
 * Supports all native button attributes and has proper focus styles.
 *
 * @example
 * ```tsx
 * <Button variant="default" onClick={handleClick}>Click me</Button>
 * <Button variant="ghost" size="icon" aria-label="Close"><X /></Button>
 * ```
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant = "default", size = "default", type = "button", ...props }, ref) => (
		<button
			ref={ref}
			type={type}
			className={cn(
				"inline-flex items-center justify-center rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-active)] disabled:pointer-events-none disabled:opacity-50",
				variantStyles[variant],
				sizeStyles[size],
				className,
			)}
			{...props}
		/>
	),
);
Button.displayName = "Button";
