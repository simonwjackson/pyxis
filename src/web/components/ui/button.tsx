import { forwardRef } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "default" | "ghost" | "outline" | "destructive";
type ButtonSize = "default" | "sm" | "lg" | "icon";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	readonly variant?: ButtonVariant;
	readonly size?: ButtonSize;
};

const variantStyles: Record<ButtonVariant, string> = {
	default: "bg-cyan-600 text-white hover:bg-cyan-700",
	ghost: "hover:bg-zinc-800 text-zinc-300",
	outline: "border border-zinc-700 text-zinc-300 hover:bg-zinc-800",
	destructive: "bg-red-600 text-white hover:bg-red-700",
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
				"inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:pointer-events-none disabled:opacity-50",
				variantStyles[variant],
				sizeStyles[size],
				className,
			)}
			{...props}
		/>
	),
);
Button.displayName = "Button";
