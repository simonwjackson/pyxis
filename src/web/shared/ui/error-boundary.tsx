/**
 * @module ErrorBoundary
 * React error boundary for catching and displaying component errors.
 */

import { Component, type ReactNode } from "react";
import { Button } from "./button";

/**
 * Props for the ErrorBoundary component.
 */
type ErrorBoundaryProps = {
	/** Child components to wrap with error boundary */
	readonly children: ReactNode;
	/** Custom fallback UI to show on error (optional) */
	readonly fallback?: ReactNode;
};

/**
 * Internal state tracking error status.
 */
type ErrorBoundaryState = {
	/** Whether an error has been caught */
	readonly hasError: boolean;
	/** The caught error object, or null */
	readonly error: Error | null;
};

/**
 * Error boundary component that catches JavaScript errors in child components.
 * Displays a fallback UI with error message and retry option.
 *
 * Note: This uses a class component because React's error boundaries
 * require getDerivedStateFromError or componentDidCatch lifecycle methods.
 *
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <RiskyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}
			return (
				<div className="flex flex-col items-center justify-center p-8 text-center">
					<div className="w-16 h-16 mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--color-error) 10%, transparent)" }}>
						<svg className="w-8 h-8 text-[var(--color-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
						</svg>
					</div>
					<h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">Something went wrong</h3>
					<p className="text-sm text-[var(--color-text-muted)] mb-4 max-w-md">
						{this.state.error?.message ?? "An unexpected error occurred"}
					</p>
					<Button
						variant="outline"
						onClick={() => this.setState({ hasError: false, error: null })}
					>
						Try again
					</Button>
				</div>
			);
		}

		return this.props.children;
	}
}
