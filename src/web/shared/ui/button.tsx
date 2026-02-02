import { forwardRef } from "react";
import { cn } from "../lib/utils";

type ButtonVariant = "default" | "ghost" | "outline" | "destructive";
type ButtonSize = "default" | "sm" | "lg" | "icon";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	readonly variant?: ButtonVariant;
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

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant = "default", size = "default", ...props }, ref) => (
		<button
			ref={ref}
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
