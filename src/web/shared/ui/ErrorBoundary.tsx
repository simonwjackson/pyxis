/**
 * @module ErrorBoundary
 * React error boundary for catching and displaying component errors.
 */

import { Component, type ReactNode } from "react";
import { Button } from "./Button";

/**
 * Props for the ErrorBoundary component.
 */
type ErrorBoundaryProps = {
  /** Child components to wrap with error boundary */
  readonly children: ReactNode;
  /** Custom fallback UI to show on error (optional) */
  readonly fallback?: ReactNode;
};

/** Internal error-boundary state ADT. */
type ErrorBoundaryState =
  | { readonly _tag: "Ready" }
  | { readonly _tag: "Crashed"; readonly error: Error };

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
 * <RiskyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { _tag: "Ready" };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { _tag: "Crashed", error };
  }

  render() {
    if (this.state._tag === "Crashed") {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <div
            className="w-16 h-16 mb-4 flex items-center justify-center"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--color-error) 10%, transparent)",
            }}
          >
            <svg
              className="w-8 h-8 text-pyxis-error"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-pyxis-text mb-2">
            something went wrong
          </h3>
          <p className="text-sm text-pyxis-muted mb-4 max-w-md">
            {this.state.error.message}
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ _tag: "Ready" })}
          >
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
