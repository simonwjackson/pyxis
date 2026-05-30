import { describe, expect, it } from "bun:test";
import { Cause } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import type {
  ApiAuthStatus,
  ApiSettings,
  ApiUsageInfo,
} from "../../../api/contracts/auth.js";
import { SettingsState } from "./SettingsState.js";

const statusWith = (hasPandora: boolean): ApiAuthStatus => ({
  authenticated: true,
  hasPandora,
});
const settingsSample: ApiSettings = { username: "me@example.com" };
const usageSample: ApiUsageInfo = { accountMonthlyListening: 36000 };

describe("SettingsState.fromResults", () => {
  it("is Loading while auth status is initial", () => {
    expect(
      SettingsState.fromResults(
        AsyncResult.initial(true),
        AsyncResult.initial(true),
        AsyncResult.initial(true),
      ),
    ).toEqual({ _tag: "Loading" });
  });

  it("is Unavailable when auth status errors", () => {
    expect(
      SettingsState.fromResults(
        AsyncResult.failure(Cause.die("boom")),
        AsyncResult.initial(true),
        AsyncResult.initial(true),
      ),
    ).toEqual({ _tag: "Unavailable" });
  });

  it("is NoAccount when status says hasPandora=false", () => {
    expect(
      SettingsState.fromResults(
        AsyncResult.success(statusWith(false)),
        AsyncResult.initial(true),
        AsyncResult.initial(true),
      ),
    ).toEqual({ _tag: "NoAccount" });
  });

  it("is Ready with null settings/usage when those are still loading", () => {
    expect(
      SettingsState.fromResults(
        AsyncResult.success(statusWith(true)),
        AsyncResult.initial(true),
        AsyncResult.initial(true),
      ),
    ).toEqual({ _tag: "Ready", settings: null, usage: null });
  });

  it("is Ready with concrete settings/usage values when loaded", () => {
    expect(
      SettingsState.fromResults(
        AsyncResult.success(statusWith(true)),
        AsyncResult.success(settingsSample),
        AsyncResult.success(usageSample),
      ),
    ).toEqual({
      _tag: "Ready",
      settings: settingsSample,
      usage: usageSample,
    });
  });
});
