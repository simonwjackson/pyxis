/**
 * @module NavItems
 * Shared navigation item definitions used by sidebar and mobile nav.
 */

/**
 * Navigation item configuration.
 */
export type NavItem = {
  readonly label: string;
  readonly path: string;
  readonly requiresPandora?: boolean;
};

/** Navigation items — text only, Zune style */
export const navItems: readonly NavItem[] = [
  { label: "home", path: "/" },
  { label: "stations", path: "/stations", requiresPandora: true },
  { label: "search", path: "/search" },
  { label: "bookmarks", path: "/bookmarks", requiresPandora: true },
  { label: "genres", path: "/genres", requiresPandora: true },
  { label: "history", path: "/history" },
  { label: "settings", path: "/settings" },
];
