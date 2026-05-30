import type { ReactNode } from "react";

type StationListRowNameProps = {
  readonly isActive: boolean;
  readonly children: ReactNode;
};

export function StationListRowName({
  isActive,
  children,
}: StationListRowNameProps) {
  return (
    <p
      data-active={isActive || undefined}
      className="zune-list-title truncate text-pyxis-muted data-[active]:text-pyxis-text"
    >
      {children}
    </p>
  );
}
