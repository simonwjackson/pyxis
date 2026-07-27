import { describe, expect, it } from "bun:test";
import { CLIENT_MODE_COOKIE, createClientModeAuthority } from "./clientMode.js";

function cookieFrom(setCookie: string): string {
  return setCookie.split(";", 1)[0] ?? "";
}

describe("client mode authority", () => {
  it("defaults ordinary documents to Player mode", () => {
    const authority = createClientModeAuthority(Buffer.alloc(32, 1));
    const resolved = authority.resolveDocumentMode(
      new Request("https://pyxis.example/"),
    );
    expect(resolved.mode).toBe("player");
    expect(resolved.setCookie).toContain(`${CLIENT_MODE_COOKIE}=`);
    expect(resolved.setCookie).toContain("HttpOnly");
    expect(resolved.setCookie).toContain("Secure");
    expect(resolved.setCookie).toContain("SameSite=Strict");
  });

  it("persists the mode selected in application settings", () => {
    const authority = createClientModeAuthority(Buffer.alloc(32, 2));
    const selected = authority.setClientMode("console", "client_settings");
    expect(selected?.mode).toBe("console");

    const reloaded = authority.resolveDocumentMode(
      new Request("https://pyxis.example/settings", {
        headers: { Cookie: cookieFrom(selected?.setCookie ?? "") },
      }),
    );
    expect(reloaded.mode).toBe("console");
  });

  it("binds local-output authorization to Player mode and client ID", () => {
    const authority = createClientModeAuthority(Buffer.alloc(32, 3));
    const player = authority.authorizeClient(
      new Request("https://pyxis.example/"),
      "client_player",
    );
    const consoleSelection = authority.setClientMode(
      "console",
      "client_console",
    );
    const consoleClient = authority.authorizeClient(
      new Request("https://pyxis.example/client-mode/authorize", {
        headers: { Cookie: cookieFrom(consoleSelection?.setCookie ?? "") },
      }),
      "client_console",
    );

    expect(player?.mode).toBe("player");
    expect(
      authority.verifyPlayerAuthorization(
        player?.authorization ?? "",
        "client_player",
      ),
    ).toBe(true);
    expect(
      authority.verifyPlayerAuthorization(
        player?.authorization ?? "",
        "client_other",
      ),
    ).toBe(false);
    expect(consoleClient?.mode).toBe("console");
    expect(
      authority.verifyPlayerAuthorization(
        consoleClient?.authorization ?? "",
        "client_console",
      ),
    ).toBe(false);
  });

  it("revokes an earlier Player authorization as soon as Console is selected", () => {
    const authority = createClientModeAuthority(Buffer.alloc(32, 4));
    const player = authority.authorizeClient(
      new Request("https://pyxis.example/"),
      "client_switching",
    );
    expect(
      authority.verifyPlayerAuthorization(
        player?.authorization ?? "",
        "client_switching",
      ),
    ).toBe(true);

    authority.setClientMode("console", "client_switching");

    expect(
      authority.verifyPlayerAuthorization(
        player?.authorization ?? "",
        "client_switching",
      ),
    ).toBe(false);
  });

  it("rejects invalid client IDs and tampered authorization tokens", () => {
    const authority = createClientModeAuthority(Buffer.alloc(32, 5));
    expect(authority.setClientMode("console", "bad")).toBeUndefined();
    const credential = authority.authorizeClient(
      new Request("https://pyxis.example/"),
      "client_player",
    );
    const token = credential?.authorization ?? "";
    expect(
      authority.verifyPlayerAuthorization(`${token}x`, "client_player"),
    ).toBe(false);
  });
});
