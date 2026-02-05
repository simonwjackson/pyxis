/**
 * @module Utils
 * Utility functions for CSS class name handling.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names with Tailwind CSS conflict resolution.
 * Combines clsx conditional class handling with tailwind-merge deduplication.
 *
 * @param inputs - Class values to merge (strings, arrays, objects)
 * @returns Merged and deduplicated class name string
 *
 * @example
 * ```ts
 * cn("px-4 py-2", isActive && "bg-blue-500", { "text-white": isActive })
 * // Returns: "px-4 py-2 bg-blue-500 text-white" (when isActive is true)
 * ```
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
