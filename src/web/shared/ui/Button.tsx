/**
 * @module Button
 * Zune-inspired button with sharp corners and clean typography.
 */

import { forwardRef } from "react";
import { cn } from "../lib/utils";

type ButtonVariant = "default" | "ghost" | "outline" | "destructive";
type ButtonSize = "default" | "sm" | "lg" | "icon";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
};

const variantStyles: Record<ButtonVariant, string> = {
  default: "bg-pyxis-primary text-white hover:brightness-110",
  ghost: "hover:bg-pyxis-highlight text-pyxis-muted",
  outline:
    "border border-pyxis-border text-pyxis-muted hover:bg-pyxis-highlight",
  destructive: "bg-pyxis-error text-white hover:brightness-110",
};

const sizeStyles: Record<ButtonSize, string> = {
  default: "h-10 px-5 py-2",
  sm: "h-8 px-3 text-sm",
  lg: "h-12 px-6 text-lg",
  icon: "h-10 w-10",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      type = "button",
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center font-medium tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pyxis-border-active disabled:pointer-events-none disabled:opacity-50",
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
