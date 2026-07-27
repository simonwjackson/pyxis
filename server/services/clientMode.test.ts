import { describe, expect, it } from "bun:test";
import {
  CLIENT_MODE_COOKIE,
  CLIENT_MODE_HEADER,
  createClientModeAuthority,
} from "./clientMode.js";

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

  it("persists a managed Console mode through its signed cookie", () => {
    const authority = createClientModeAuthority(Buffer.alloc(32, 2));
    const enrolled = authority.resolveDocumentMode(
      new Request("https://pyxis.example/", {
        headers: { [CLIENT_MODE_HEADER]: "console", "Sec-Fetch-Dest": "document" },
      }),
    );
    const reloaded = authority.resolveDocumentMode(
      new Request("https://pyxis.example/settings", {
        headers: { Cookie: cookieFrom(enrolled.setCookie) },
      }),
    );
    expect(enrolled.mode).toBe("console");
    expect(reloaded.mode).toBe("console");
  });

  it("binds local-output authorization to Player mode and client ID", () => {
    const authority = createClientModeAuthority(Buffer.alloc(32, 3));
    const player = authority.authorizeClient(
      new Request("https://pyxis.example/"),
      "client_player",
    );
    const consoleEnrollment = authority.resolveDocumentMode(
      new Request("https://pyxis.example/", {
        headers: { [CLIENT_MODE_HEADER]: "console", "Sec-Fetch-Dest": "document" },
      }),
    );
    const consoleClient = authority.authorizeClient(
      new Request("https://pyxis.example/client-mode/authorize", {
        headers: {
          Cookie: cookieFrom(consoleEnrollment.setCookie),
          [CLIENT_MODE_HEADER]: "player",
        },
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

  it("revokes an earlier Player authorization when the installation becomes a Console", () => {
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

    const consoleDocument = authority.resolveDocumentMode(
      new Request("https://pyxis.example/", {
        headers: {
          [CLIENT_MODE_HEADER]: "console",
          "Sec-Fetch-Dest": "document",
        },
      }),
    );
    authority.authorizeClient(
      new Request("https://pyxis.example/client-mode/authorize", {
        headers: { Cookie: cookieFrom(consoleDocument.setCookie) },
      }),
      "client_switching",
    );

    expect(
      authority.verifyPlayerAuthorization(
        player?.authorization ?? "",
        "client_switching",
      ),
    ).toBe(false);
  });

  it("rejects tampered mode cookies and authorization tokens", () => {
    const authority = createClientModeAuthority(Buffer.alloc(32, 4));
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
