import type { ReactNode } from "react";

type StationListRowSubtitleProps = {
	readonly children: ReactNode;
	readonly className?: string;
};

export function StationListRowSubtitle({
	children,
	className,
}: StationListRowSubtitleProps) {
	return <p className={`text-sm ${className ?? ""}`}>{children}</p>;
}
