import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";
import type { AuditRuntime } from "../src/pages/api/audit.ts";
import { handleAuditRequest } from "../src/pages/api/audit.ts";

const CLEAN_HTML = `<!doctype html><html lang="en"><head><title>A sufficiently descriptive page title for testing</title><meta name="description" content="A sufficiently detailed description that passes the Auvrora heuristic without claiming to be a search-engine requirement."><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.org/"></head><body><h1>Example</h1><img src="x.png" alt="Example"></body></html>`;

function runtime(overrides: Partial<AuditRuntime> = {}): AuditRuntime {
  return {
    fetchImpl: async () => new Response(CLEAN_HTML, { headers: { "content-type": "text/html" } }),
    now: () => new Date("2026-08-28T20:00:00.000Z"),
    ...overrides,
  };
}

function jsonRequest(body: string, headers: HeadersInit = {}): Request {
  return new Request("https://auvrora.example/api/audit", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

describe("handleAuditRequest", () => {
  it("propagates request cancellation to the outbound page fetch", async () => {
    const requestAbort = new AbortController();
    let releaseFetch: (() => void) | undefined;
    const release = new Promise<void>((resolve) => { releaseFetch = resolve; });
    let resolveSignal: ((signal: AbortSignal) => void) | undefined;
    const signalSeen = new Promise<AbortSignal>((resolve) => { resolveSignal = resolve; });

    const responsePromise = handleAuditRequest(new Request("https://auvrora.example/api/audit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.org/" }),
      signal: requestAbort.signal,
    }), {
      fetchImpl: async (_input, init) => {
        assert.ok(init?.signal);
        resolveSignal?.(init.signal);
        await release;
        return new Response(CLEAN_HTML, { headers: { "content-type": "text/html" } });
      },
    });

    const outboundSignal = await signalSeen;
    assert.equal(outboundSignal.aborted, false);
    requestAbort.abort();
    assert.equal(outboundSignal.aborted, true);
    releaseFetch?.();
    await responsePromise;
  });

  it("rejects non-POST methods", async () => {
    const response = await handleAuditRequest(new Request("https://auvrora.example/api/audit"), runtime());
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("rejects non-JSON and malformed JSON bodies", async () => {
    const plain = await handleAuditRequest(new Request("https://auvrora.example/api/audit", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "https://example.org/",
    }), runtime());
    expect(plain.status).toBe(400);

    const malformed = await handleAuditRequest(jsonRequest("{"), runtime());
    expect(malformed.status).toBe(400);
  });

  it("rejects request bodies larger than 4 KiB", async () => {
    const response = await handleAuditRequest(jsonRequest(JSON.stringify({ url: "https://example.org/", pad: "x".repeat(4096) })), runtime());
    expect(response.status).toBe(413);
  });

  it("rejects missing and extra properties", async () => {
    const missing = await handleAuditRequest(jsonRequest("{}"), runtime());
    expect(missing.status).toBe(400);

    const extra = await handleAuditRequest(jsonRequest(JSON.stringify({ url: "https://example.org/", extra: true })), runtime());
    expect(extra.status).toBe(400);
  });

  it("returns a bounded deterministic AuditRun for a valid request", async () => {
    const response = await handleAuditRequest(jsonRequest(JSON.stringify({ url: "https://example.org/" })), runtime());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await response.json() as { canonicalUrl: string; findings: unknown[]; rulesVersion: string };
    expect(body.canonicalUrl).toBe("https://example.org/");
    expect(body.findings).toEqual([]);
    expect(body.rulesVersion).toBe("2026-08-28.1");
  });

  it("preserves AuditError code and status", async () => {
    const response = await handleAuditRequest(jsonRequest(JSON.stringify({ url: "http://127.0.0.1/" })), runtime());
    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).toBe("private_url");
  });

  it("maps unknown failures to a stable internal error without details", async () => {
    const response = await handleAuditRequest(jsonRequest(JSON.stringify({ url: "https://example.org/" })), runtime({
      fetchImpl: async () => { throw new Error("secret internal detail"); },
    }));
    expect(response.status).toBe(502);
    const body = await response.json() as { error: string; message: string };
    expect(body.error).toBe("upstream_error");
    assert.ok(!body.message.includes("secret internal detail"));
  });

  it("returns 500 for an unexpected analyzer/runtime exception", async () => {
    const brokenNow = () => { throw new Error("secret time failure"); };
    const response = await handleAuditRequest(jsonRequest(JSON.stringify({ url: "https://example.org/" })), runtime({ now: brokenNow }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "internal_error",
      message: "The audit could not be completed.",
    });
  });

  it("returns 429 when the injected limiter denies the request", async () => {
    let fetched = false;
    let observedKey = "";
    const response = await handleAuditRequest(jsonRequest(JSON.stringify({ url: "https://example.org/" }), {
      "cf-connecting-ip": "203.0.113.44",
    }), runtime({
      limiter: { allow: async (key) => { observedKey = key; return false; } },
      fetchImpl: async () => { fetched = true; return new Response(CLEAN_HTML); },
    }));
    expect(response.status).toBe(429);
    expect(fetched).toBeFalsy();
    expect(observedKey.includes("203.0.113.44")).toBeFalsy();
    expect(observedKey.length > 16).toBeTruthy();
  });
});
