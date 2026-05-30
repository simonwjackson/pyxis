/**
 * @module Input
 * Zune-inspired text input with sharp corners and clean styling.
 */

import { forwardRef } from "react";
import { cn } from "../lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full border border-pyxis-border bg-pyxis-highlight px-3 py-2 text-sm text-pyxis-text placeholder:text-pyxis-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pyxis-border-active disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
