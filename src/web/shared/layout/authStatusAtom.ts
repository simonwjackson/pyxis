/**
 * @module authStatusAtom
 *
 * Shared auth-status query atom for the shell. Both `Sidebar` and
 * `MobileNav` read the same atom so the navigation flips once when the
 * Pandora session becomes available rather than running two independent
 * queries.
 */

import { PyxisRpcClient } from "../api/rpcClient.js";

export const authStatusQueryAtom = PyxisRpcClient.query(
	"auth.status.get",
	undefined,
);
