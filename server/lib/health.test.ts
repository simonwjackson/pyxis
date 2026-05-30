import { describe, expect, it } from "bun:test";
import { createHealthResponse, isHealthRequest } from "./health.js";

describe("isHealthRequest", () => {
  it("matches only GET /healthz", () => {
    expect(isHealthRequest(new URL("http://pyxis.local/healthz"), "GET")).toBe(
      true,
    );
    expect(isHealthRequest(new URL("http://pyxis.local/healthz"), "POST")).toBe(
      false,
    );
    expect(isHealthRequest(new URL("http://pyxis.local/healthz/"), "GET")).toBe(
      false,
    );
    expect(isHealthRequest(new URL("http://pyxis.local/"), "GET")).toBe(false);
    expect(
      isHealthRequest(new URL("http://pyxis.local/trpc/healthz"), "GET"),
    ).toBe(false);
  });
});

describe("createHealthResponse", () => {
  it("returns a no-store Pyxis liveness marker without product details", async () => {
    const response = createHealthResponse();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("location")).toBeNull();

    const body = await response.json();
    expect(body).toEqual({ service: "pyxis", status: "ok" });
    expect(JSON.stringify(body)).not.toContain("version");
    expect(JSON.stringify(body)).not.toContain("library");
    expect(JSON.stringify(body)).not.toContain("source");
    expect(JSON.stringify(body)).not.toContain("hostname");
  });
});
