import type {
  ApiPlaybackOutputState,
  ApiSelectBrowserOutputInput,
  ApiSelectSonosOutputInput,
} from "@shared/api/contracts/output.js";
import { Effect, Queue as EffectQueue, Stream } from "effect";
import { publicHandler } from "../handler.js";
import type { OutputShape } from "../services/output.js";

const OUTPUT_STREAM_HEARTBEAT_MS = 5000;

export type OutputHandlerDeps = { readonly output: OutputShape };

export const outputHandlers = (deps: OutputHandlerDeps) => ({
  "output.state.get": () => publicHandler(deps.output.getState),
  "output.browser.select": (payload: ApiSelectBrowserOutputInput) =>
    publicHandler(deps.output.selectBrowser(payload)),
  "output.sonos.select": (payload: ApiSelectSonosOutputInput) =>
    publicHandler(deps.output.selectSonos(payload)),
  "output.state.stream": () =>
    Stream.callback<ApiPlaybackOutputState>((mailbox) =>
      Effect.gen(function* () {
        const emitCurrent = () =>
          Effect.runPromise(deps.output.getState).then((state) => {
            EffectQueue.offerUnsafe(mailbox, state);
          });

        const initial = yield* deps.output.getState;
        EffectQueue.offerUnsafe(mailbox, initial);
        const unsubscribe = yield* deps.output.subscribe(() => {
          void emitCurrent();
        });
        yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));
        yield* Effect.gen(function* () {
          yield* Effect.sleep(`${OUTPUT_STREAM_HEARTBEAT_MS} millis`);
          const current = yield* deps.output.getState;
          EffectQueue.offerUnsafe(mailbox, current);
        }).pipe(Effect.forever, Effect.forkScoped);
      }),
    ),
});
