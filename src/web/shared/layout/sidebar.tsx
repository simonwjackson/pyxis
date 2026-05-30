/**
 * @module Sidebar
 * Zune-inspired text-dominant navigation sidebar.
 * Large lowercase text links replace icon-heavy navigation.
 */

import { useAtomValue } from "@effect/atom-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { projectQueryResult } from "../effect/projectQueryResult";
/**
 * Navigation item configuration.
 */
import { navItems } from "../lib/nav-items";
import { cn } from "../lib/utils";
import { AuthStatusState } from "./AuthStatusState";
import { authStatusQueryAtom } from "./authStatusAtom";

/**
 * Desktop sidebar with Zune panoramic text navigation.
 * Hidden on mobile (< md breakpoint).
 */
export function Sidebar() {
  const { location } = useRouterState();
  const status = AuthStatusState.fromResult(
    projectQueryResult(useAtomValue(authStatusQueryAtom)),
  );
  const hasPandora = status._tag === "Ready" ? status.hasPandora : false;
  const visibleItems = navItems.filter(
    (item) => !item.requiresPandora || hasPandora,
  );

  return (
    <aside
      className="hidden md:flex md:w-64 flex-col bg-[var(--color-bg-panel)]"
      aria-label="Main navigation"
    >
      {/* Brand */}
      <div className="px-8 pt-10 pb-8">
        <Link
          to="/"
          search={{
            pl_sort: undefined,
            pl_page: undefined,
            al_sort: undefined,
            al_page: undefined,
          }}
          className="block"
        >
          <span className="zune-display text-5xl text-[var(--color-primary)]">
            pyxis
          </span>
        </Link>
      </div>

      {/* Navigation — large text links */}
      <nav className="flex-1 px-8 space-y-1">
        {visibleItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "block py-1.5 transition-colors zune-heading text-[1.35rem]",
                isActive
                  ? "text-[var(--color-text)]"
                  : "text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
