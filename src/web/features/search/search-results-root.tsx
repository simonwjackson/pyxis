import type { ReactNode } from "react";

type SearchResultsRootProps = {
	readonly children: ReactNode;
};

export function SearchResultsRoot({ children }: SearchResultsRootProps) {
	return <div className="space-y-10">{children}</div>;
}
