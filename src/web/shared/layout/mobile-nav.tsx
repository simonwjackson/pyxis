/**
 * @module MobileNav
 * Zune-inspired mobile navigation with panoramic text menu.
 * Visible only on mobile viewports (< md breakpoint).
 */

import { useAtomValue } from "@effect/atom-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { projectQueryResult } from "../effect/projectQueryResult";
import { navItems } from "../lib/nav-items";
import { cn } from "../lib/utils";
import { AuthStatusState } from "./AuthStatusState";
import { authStatusQueryAtom } from "./authStatusAtom";

/**
 * Mobile navigation with Zune-style full-screen text menu.
 */
export function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const { location } = useRouterState();
  const status = AuthStatusState.fromResult(
    projectQueryResult(useAtomValue(authStatusQueryAtom)),
  );
  const hasPandora = status._tag === "Ready" ? status.hasPandora : false;
  const visibleItems = navItems.filter(
    (item) => !item.requiresPandora || hasPandora,
  );

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between px-5 py-4 safe-top">
        <Link
          to="/"
          search={{
            pl_sort: undefined,
            pl_page: undefined,
            al_sort: undefined,
            al_page: undefined,
          }}
          className="zune-display text-2xl text-[var(--color-primary)]"
        >
          pyxis
        </Link>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          type="button"
          aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isOpen}
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>
      {isOpen && (
        <div className="absolute inset-x-0 top-14 bottom-0 z-50 bg-[var(--color-bg-panel)] pb-40 overflow-y-auto">
          <nav className="px-8 pt-12 space-y-1" aria-label="Mobile navigation">
            {visibleItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "block py-3 zune-heading text-4xl transition-colors",
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
        </div>
      )}
    </div>
  );
}
