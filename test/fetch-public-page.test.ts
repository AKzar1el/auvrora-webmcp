import { describe, expect, it } from "vitest";
import { fetchPublicPage } from "../src/lib/audit/fetch-public-page.ts";

async function expectRejectCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error("expected promise to reject");
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

function htmlResponse(body = "<html><head><title>ok</title></head><body></body></html>", init: ResponseInit = {}) {
  return new Response(body, {
    status: 200,
    ...init,
    headers: { "content-type": "text/html; charset=utf-8", ...(init.headers ?? {}) },
  });
}

describe("fetchPublicPage", () => {
  it("fetches one public HTML page with bounded request headers", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return htmlResponse("<html>ok</html>");
    };

    const result = await fetchPublicPage("https://example.org/a#fragment", {
      fetchImpl: fetchImpl as typeof fetch,
      now: () => new Date("2026-08-28T20:00:00.000Z"),
    });

    expect(result.requestedUrl).toBe("https://example.org/a");
    expect(result.canonicalUrl).toBe("https://example.org/a");
    expect(result.html).toBe("<html>ok</html>");
    expect(result.fetchedAt).toBe("2026-08-28T20:00:00.000Z");
    expect(calls.length).toBe(1);
    expect(calls[0].init?.redirect).toBe("manual");
    expect(new Headers(calls[0].init?.headers).get("accept")).toContain("text/html");
    expect(new Headers(calls[0].init?.headers).get("user-agent")).toContain("LoopFix-WebMCP/1.0");
  });

  it("follows a relative redirect and revalidates the destination", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === "https://example.org/start") {
        return new Response(null, { status: 302, headers: { location: "/final" } });
      }
      return htmlResponse("<html>final</html>");
    };

    const result = await fetchPublicPage("https://example.org/start", { fetchImpl: fetchImpl as typeof fetch });
    expect(result.canonicalUrl).toBe("https://example.org/final");
    expect(calls.length).toBe(2);
  });

  it("rejects a private redirect before issuing the second request", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
    };

    await expectRejectCode(fetchPublicPage("https://example.org/start", { fetchImpl: fetchImpl as typeof fetch }), "private_url");
    expect(calls.length).toBe(1);
  });

  it("rejects redirect loops", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      const location = url.includes("/a") ? "https://example.org/b" : "https://example.org/a";
      return new Response(null, { status: 302, headers: { location } });
    };

    await expectRejectCode(fetchPublicPage("https://example.org/a", { fetchImpl: fetchImpl as typeof fetch }), "redirect_loop");
  });

  it("rejects a fourth redirect", async () => {
    const fetchImpl = async (input: RequestInfo | URL) => {
      const step = Number(new URL(String(input)).pathname.slice(1) || "0");
      return new Response(null, { status: 302, headers: { location: `https://example.org/${step + 1}` } });
    };

    await expectRejectCode(fetchPublicPage("https://example.org/0", { fetchImpl: fetchImpl as typeof fetch }), "redirect_chain_too_long");
  });

  it("rejects redirects without Location", async () => {
    const fetchImpl = async () => new Response(null, { status: 302 });
    await expectRejectCode(fetchPublicPage("https://example.org/", { fetchImpl: fetchImpl as typeof fetch }), "invalid_redirect");
  });

  it("maps a syntactically invalid redirect target to invalid_redirect", async () => {
    const fetchImpl = async () => new Response(null, { status: 302, headers: { location: "http://[:::]" } });
    await expectRejectCode(fetchPublicPage("https://example.org/", { fetchImpl: fetchImpl as typeof fetch }), "invalid_redirect");
  });

  it("rejects non-HTML final responses", async () => {
    const fetchImpl = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    await expectRejectCode(fetchPublicPage("https://example.org/", { fetchImpl: fetchImpl as typeof fetch }), "not_html");
  });

  it("rejects declared oversized responses before reading the body", async () => {
    const fetchImpl = async () => htmlResponse("small", { headers: { "content-length": String(2 * 1024 * 1024 + 1) } });
    await expectRejectCode(fetchPublicPage("https://example.org/", { fetchImpl: fetchImpl as typeof fetch }), "response_too_large");
  });

  it("rejects streamed responses that cross the 2 MiB limit", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    const fetchImpl = async () => new Response(stream, { status: 200, headers: { "content-type": "text/html" } });
    await expectRejectCode(fetchPublicPage("https://example.org/", { fetchImpl: fetchImpl as typeof fetch }), "response_too_large");
  });

  it("maps non-success final responses to upstream_error", async () => {
    const fetchImpl = async () => new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    await expectRejectCode(fetchPublicPage("https://example.org/", { fetchImpl: fetchImpl as typeof fetch }), "upstream_error");
  });

  it("propagates caller cancellation as AbortError", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      return htmlResponse();
    };

    try {
      await fetchPublicPage("https://example.org/", { fetchImpl: fetchImpl as typeof fetch, signal: controller.signal });
      throw new Error("expected cancellation");
    } catch (error) {
      expect((error as Error).name).toBe("AbortError");
    }
  });

  it("maps the internal deadline to request_timeout", async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    globalThis.setTimeout = ((callback: TimerHandler) => {
      queueMicrotask(callback as () => void);
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;

    try {
      const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
      await expectRejectCode(fetchPublicPage("https://example.org/", { fetchImpl: fetchImpl as typeof fetch }), "request_timeout");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });
});
