import type { ApiPlaybackOutputState } from "../../../api/contracts/output.js";
import type { ClientProfile } from "../client/clientIdentity.js";

export type BrowserOutputAuthority = {
  readonly ownsLocalPlayback: boolean;
  readonly canSelectLocalOutput: boolean;
};

export function resolveBrowserOutputAuthority(
  profile: ClientProfile,
  output: ApiPlaybackOutputState | null,
  clientId: string,
): BrowserOutputAuthority {
  const canSelectLocalOutput = profile.localOutputAllowed;
  return {
    canSelectLocalOutput,
    ownsLocalPlayback:
      canSelectLocalOutput &&
      output?.type === "browser" &&
      output.clientId === clientId,
  };
}
