import type { ApiPlaybackOutputState } from "../../../api/contracts/output.js";
import type { ClientMode } from "../client/clientIdentity.js";

export type BrowserOutputAuthority = {
  readonly ownsLocalPlayback: boolean;
  readonly canSelectLocalOutput: boolean;
};

export function resolveBrowserOutputAuthority(
  mode: ClientMode,
  output: ApiPlaybackOutputState | null,
  clientId: string,
): BrowserOutputAuthority {
  const canSelectLocalOutput = mode === "player";
  return {
    canSelectLocalOutput,
    ownsLocalPlayback:
      canSelectLocalOutput &&
      output?.type === "browser" &&
      output.clientId === clientId,
  };
}
