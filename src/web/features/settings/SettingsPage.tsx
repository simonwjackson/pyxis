/**
 * @module SettingsPage
 * User settings and account information page.
 *
 * Reads `auth.status`, `auth.settings`, and `auth.usage` through the Effect
 * RPC client and adapts them into the {@link SettingsState} ADT before
 * rendering. The explicit-content-filter mutation publishes the
 * `auth.settings` reactivity tag so the settings atom refreshes after a
 * successful write (the legacy React Query auth-settings invalidation
 * fan-out).
 */

import { PyxisRpcClient } from "@app/shared/api/rpcClient";
import {
  getWebClientId,
  getWebClientMode,
} from "@app/shared/client/clientIdentity";
import { projectQueryResult } from "@app/shared/effect/projectQueryResult";
import { authStatusQueryAtom } from "@app/shared/layout/authStatusAtom";
import { Spinner } from "@app/shared/ui/Spinner";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SettingsState } from "./SettingsState";
import { SonosSettingsSection } from "./SonosSettingsSection";

const AUTH_SETTINGS_TAG = "auth.settings" as const;

/** Reactivity key set used by both the settings query and the mutation. */
const settingsReactivityKeys = [AUTH_SETTINGS_TAG] as const;

const settingsQueryAtom = PyxisRpcClient.query("auth.settings.get", undefined, {
  reactivityKeys: settingsReactivityKeys,
});
const usageQueryAtom = PyxisRpcClient.query("auth.usage.get", undefined);
const explicitFilterMutationAtom = PyxisRpcClient.mutation(
  "auth.explicitFilter.set",
);

export function SettingsPage() {
  const statusResult = projectQueryResult(useAtomValue(authStatusQueryAtom));
  const settingsResult = projectQueryResult(useAtomValue(settingsQueryAtom));
  const usageResult = projectQueryResult(useAtomValue(usageQueryAtom));
  const state = useMemo(
    () => SettingsState.fromResults(statusResult, settingsResult, usageResult),
    [statusResult, settingsResult, usageResult],
  );

  const setExplicitFilter = useAtomSet(explicitFilterMutationAtom, {
    mode: "promiseExit",
  });

  const toggleExplicit = (enabled: boolean) => {
    void setExplicitFilter({
      payload: { enabled },
      reactivityKeys: settingsReactivityKeys,
    }).then((exit) => {
      if (exit._tag === "Success") {
        toast.success("setting updated");
      } else {
        toast.error("couldn't update setting");
      }
    });
  };

  return (
    <div className="page-frame lattice-container space-y-10">
      <h2 className="zune-display zune-page-title text-pyxis-text">settings</h2>

      <ClientModeSettingsSection />

      <div className="border-t border-pyxis-border" />

      <SonosSettingsSection />

      <div className="border-t border-pyxis-border" />

      {state._tag === "Loading" ? (
        <section
          className="min-h-24 flex items-center justify-center"
          aria-label="Loading account settings"
        >
          <Spinner />
        </section>
      ) : null}

      {state._tag === "NoAccount" || state._tag === "Unavailable" ? (
        <div className="py-16 text-pyxis-dim">
          <p className="zune-display text-4xl text-pyxis-dim/40 mb-4">
            no account
          </p>
          <p className="text-sm">
            configure credentials in your config file to see account settings.
          </p>
        </div>
      ) : null}

      {state._tag === "Ready" && state.settings ? (
        <SettingsAccountSection
          settings={state.settings}
          onToggleExplicit={toggleExplicit}
        />
      ) : null}

      {state._tag === "Ready" && state.usage ? (
        <SettingsUsageSection usage={state.usage} />
      ) : null}
    </div>
  );
}

function ClientModeSettingsSection() {
  const mode = useMemo(() => getWebClientMode(), []);
  const clientId = useMemo(() => getWebClientId(), []);
  const [busy, setBusy] = useState(false);
  const consoleMode = mode === "console";

  const setConsoleMode = (enabled: boolean) => {
    if (busy) return;
    setBusy(true);
    void fetch("/client-mode", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: enabled ? "console" : "player",
        clientId,
      }),
    })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Mode update failed (${response.status})`);
        window.location.reload();
      })
      .catch(() => {
        setBusy(false);
        toast.error("couldn't update device mode");
      });
  };

  return (
    <section className="space-y-4" aria-labelledby="device-mode-heading">
      <h3 id="device-mode-heading" className="zune-label text-pyxis-muted">
        this device
      </h3>
      <div className="flex items-center justify-between gap-6 py-2">
        <div>
          <p className="zune-meta text-pyxis-text">console mode</p>
          <p className="mt-1 text-sm text-pyxis-dim">
            Control shared playback and network outputs without playing audio on
            this device.
          </p>
        </div>
        <button
          onClick={() => setConsoleMode(!consoleMode)}
          disabled={busy}
          className={`w-12 h-6 shrink-0 rounded-full transition-colors relative disabled:opacity-50 ${
            consoleMode ? "bg-pyxis-primary" : "bg-pyxis-highlight"
          }`}
          type="button"
          role="switch"
          aria-checked={consoleMode}
          aria-label="Console mode"
        >
          <span
            className={`block w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
              consoleMode ? "translate-x-6" : "translate-x-0.5"
            }`}
            aria-hidden="true"
          />
        </button>
      </div>
    </section>
  );
}

function SettingsAccountSection({
  settings,
  onToggleExplicit,
}: {
  settings: NonNullable<Extract<SettingsState, { _tag: "Ready" }>["settings"]>;
  onToggleExplicit: (enabled: boolean) => void;
}) {
  const explicitOn = settings.isExplicitContentFilterEnabled === true;
  return (
    <section className="space-y-4">
      <h3 className="zune-label text-pyxis-muted">pandora account</h3>
      {settings.username && (
        <div className="flex items-center justify-between py-2">
          <span className="zune-meta">email</span>
          <span className="zune-copy text-sm text-pyxis-muted">
            {settings.username}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between py-2">
        <span className="zune-meta">explicit content filter</span>
        <button
          onClick={() => onToggleExplicit(!explicitOn)}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            explicitOn ? "bg-pyxis-primary" : "bg-pyxis-highlight"
          }`}
          type="button"
          role="switch"
          aria-checked={explicitOn}
          aria-label="Explicit content filter"
        >
          <div
            className={`w-5 h-5 rounded-full bg-white transition-transform absolute top-0.5 ${
              explicitOn ? "translate-x-6" : "translate-x-0.5"
            }`}
            aria-hidden="true"
          />
        </button>
      </div>
    </section>
  );
}

function SettingsUsageSection({
  usage,
}: {
  usage: NonNullable<Extract<SettingsState, { _tag: "Ready" }>["usage"]>;
}) {
  const monthly = usage.accountMonthlyListening;
  const cap = usage.monthlyCapHours;
  return (
    <section className="space-y-2">
      <h3 className="zune-label text-pyxis-muted">pandora usage</h3>
      {typeof monthly === "number" && (
        <div className="flex items-center justify-between py-2">
          <span className="zune-copy text-sm text-pyxis-muted">
            listening this month
          </span>
          <span className="zune-data text-sm text-pyxis-muted">
            {Math.round(monthly / 3600)}h
          </span>
        </div>
      )}
      {typeof cap === "number" && (
        <div className="flex items-center justify-between py-2">
          <span className="zune-copy text-sm text-pyxis-muted">
            monthly cap
          </span>
          <span className="zune-data text-sm text-pyxis-muted">{cap}h</span>
        </div>
      )}
    </section>
  );
}
