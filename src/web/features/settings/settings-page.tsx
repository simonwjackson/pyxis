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

import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { PyxisRpcClient } from "@/web/shared/api/rpcClient";
import { projectQueryResult } from "@/web/shared/effect/projectQueryResult";
import { authStatusQueryAtom } from "@/web/shared/layout/authStatusAtom";
import { Spinner } from "@/web/shared/ui/spinner";
import { SettingsState } from "./SettingsState";

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

  if (state._tag === "Loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 sm:px-8 py-10 space-y-8">
      <h2 className="zune-display zune-page-title text-[var(--color-text)]">
        settings
      </h2>

      {state._tag === "NoAccount" || state._tag === "Unavailable" ? (
        <div className="py-16 text-[var(--color-text-dim)]">
          <p className="zune-display text-4xl text-[var(--color-text-dim)]/40 mb-4">
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
      <h3 className="zune-label text-[var(--color-text-muted)]">
        pandora account
      </h3>
      {settings.username && (
        <div className="flex items-center justify-between py-2">
          <span className="zune-meta">email</span>
          <span className="zune-copy text-sm text-[var(--color-text-muted)]">
            {settings.username}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between py-2">
        <span className="zune-meta">explicit content filter</span>
        <button
          onClick={() => onToggleExplicit(!explicitOn)}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            explicitOn
              ? "bg-[var(--color-primary)]"
              : "bg-[var(--color-bg-highlight)]"
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
      <h3 className="zune-label text-[var(--color-text-muted)]">
        pandora usage
      </h3>
      {typeof monthly === "number" && (
        <div className="flex items-center justify-between py-2">
          <span className="zune-copy text-sm text-[var(--color-text-muted)]">
            listening this month
          </span>
          <span className="zune-data text-sm text-[var(--color-text-muted)]">
            {Math.round(monthly / 3600)}h
          </span>
        </div>
      )}
      {typeof cap === "number" && (
        <div className="flex items-center justify-between py-2">
          <span className="zune-copy text-sm text-[var(--color-text-muted)]">
            monthly cap
          </span>
          <span className="zune-data text-sm text-[var(--color-text-muted)]">
            {cap}h
          </span>
        </div>
      )}
    </section>
  );
}
