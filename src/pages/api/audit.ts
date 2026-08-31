import type { APIRoute } from "astro";
import { analyzePage } from "../../lib/audit/analyze-page.ts";
import { fetchPublicPage } from "../../lib/audit/fetch-public-page.ts";
import { AuditError } from "../../lib/audit/types.ts";

const MAX_BODY_BYTES = 4 * 1024;

export interface AuditLimiter {
  allow(key: string): Promise<boolean>;
}

export type AuditRuntime = {
  fetchImpl?: typeof fetch;
  limiter?: AuditLimiter;
  now?: () => Date;
};

type JsonObject = Record<string, unknown>;

type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

function json(body: JsonObject, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...Object.fromEntries(new Headers(extraHeaders)),
    },
  });
}

async function readBoundedBody(request: Request): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new AuditError("request_too_large", "The request body is too large.", 413);
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new AuditError("request_too_large", "The request body is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function parseBody(text: string): { url: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AuditError("invalid_request", "Send a valid JSON object containing only url.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuditError("invalid_request", "Send a JSON object containing only url.");
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "url") {
    throw new AuditError("invalid_request", "The request must contain exactly one url property.");
  }
  const url = (value as { url?: unknown }).url;
  if (typeof url !== "string" || !url.trim()) {
    throw new AuditError("invalid_request", "The url property must be a non-empty string.");
  }
  return { url };
}

async function digestHex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deriveRateLimitKey(request: Request, now: () => Date): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip")?.trim() || "local";
  const day = now().toISOString().slice(0, 10);
  return digestHex(`auvrora-audit|${day}|${ip}`);
}

export async function handleAuditRequest(request: Request, runtime: AuditRuntime = {}): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed", message: "Use POST /api/audit." }, 405, { allow: "POST" });

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return json({ error: "invalid_request", message: "Content-Type must be application/json." }, 400);
  }

  const now = runtime.now ?? (() => new Date());

  try {
    const body = parseBody(await readBoundedBody(request));
    if (runtime.limiter) {
      const key = await deriveRateLimitKey(request, now);
      if (!await runtime.limiter.allow(key)) {
        return json({ error: "rate_limited", message: "Too many audit requests. Try again shortly." }, 429);
      }
    }

    const page = await fetchPublicPage(body.url, {
      fetchImpl: runtime.fetchImpl,
      now,
      signal: request.signal,
    });
    return json(analyzePage(page) as unknown as JsonObject);
  } catch (error) {
    if (error instanceof AuditError) return json({ error: error.code, message: error.message }, error.status);
    return json({ error: "internal_error", message: "The audit could not be completed." }, 500);
  }
}

function createProductionLimiter(binding: RateLimitBinding | undefined): AuditLimiter | undefined {
  if (!binding) return undefined;
  return {
    async allow(key) {
      const result = await binding.limit({ key });
      return result.success;
    },
  };
}

async function handleProductionRequest(request: Request): Promise<Response> {
  const workers = await import("cloudflare:workers");
  const workerEnv = workers.env as unknown as { AUDIT_RATE_LIMITER?: RateLimitBinding };
  return handleAuditRequest(request, {
    limiter: createProductionLimiter(workerEnv.AUDIT_RATE_LIMITER),
  });
}

export const POST: APIRoute = ({ request }) => handleProductionRequest(request);
export const ALL: APIRoute = ({ request }) => handleProductionRequest(request);
