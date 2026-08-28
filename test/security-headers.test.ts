import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "../src/lib/security/headers.ts";

describe("security headers", () => {
  it("sets the required browser isolation and content-safety baseline", () => {
    const response = applySecurityHeaders(new Response("ok"));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=(), payment=(), tools=(self)");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp.startsWith("default-src 'self'")).toBeTruthy();
    expect(csp.includes("*")).toBeFalsy();
  });

  it("preserves response status and existing headers", () => {
    const response = applySecurityHeaders(new Response("no", { status: 404, headers: { "cache-control": "no-store" } }));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
