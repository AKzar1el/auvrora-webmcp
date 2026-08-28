import { AuditError } from "./types.ts";
import { parsePublicTarget } from "./url-policy.ts";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 12_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type FetchedPage = {
  requestedUrl: string;
  canonicalUrl: string;
  html: string;
  fetchedAt: string;
};

type FetchOptions = {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  now?: () => Date;
};

function abortError(reason?: unknown): Error {
  if (reason instanceof Error) return reason;
  return new DOMException("The audit was cancelled.", "AbortError");
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Best-effort resource cleanup. The response is discarded either way.
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
    await cancelBody(response);
    throw new AuditError("response_too_large", "The page response exceeds the 2 MiB audit limit.", 413);
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new AuditError("response_too_large", "The page response exceeds the 2 MiB audit limit.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

type PendingRequest = {
  response: Response;
  controller: AbortController;
  timeoutReason: DOMException;
  parentSignal?: AbortSignal;
  cleanup: () => void;
};

function requestAbortError(request: Pick<PendingRequest, "controller" | "timeoutReason" | "parentSignal">): Error | null {
  if (request.parentSignal?.aborted) return abortError(request.parentSignal.reason);
  if (request.controller.signal.aborted && (
    request.controller.signal.reason === request.timeoutReason ||
    (request.controller.signal.reason as { name?: string } | undefined)?.name === "TimeoutError"
  )) {
    return new AuditError("request_timeout", "The page request timed out.", 504);
  }
  return null;
}

async function requestPage(url: URL, fetchImpl: typeof fetch, parentSignal?: AbortSignal): Promise<PendingRequest> {
  const controller = new AbortController();
  const timeoutReason = new DOMException("The page request timed out.", "TimeoutError");
  const timeout = setTimeout(() => controller.abort(timeoutReason), REQUEST_TIMEOUT_MS);
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  const cleanup = () => {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  };

  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    const response = await fetchImpl(url.href, {
      method: "GET",
      redirect: "manual",
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "user-agent": "LoopFix-WebMCP/1.0 (+https://github.com/AKzar1el/loopfix-mcp)",
      },
      signal: controller.signal,
    });
    return { response, controller, timeoutReason, parentSignal, cleanup };
  } catch (error) {
    cleanup();
    const mapped = requestAbortError({ controller, timeoutReason, parentSignal });
    if (mapped) throw mapped;
    throw new AuditError("upstream_error", "The page request failed.", 502);
  }
}

export async function fetchPublicPage(input: string, options: FetchOptions = {}): Promise<FetchedPage> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const initial = parsePublicTarget(input);
  const requestedUrl = initial.href;
  let current = initial;
  const visited = new Set([current.href]);

  for (let redirects = 0; ; redirects += 1) {
    const request = await requestPage(current, fetchImpl, options.signal);
    const { response } = request;

    try {
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          await cancelBody(response);
          throw new AuditError("invalid_redirect", "The page returned a redirect without a Location header.", 502);
        }
        if (redirects >= MAX_REDIRECTS) {
          await cancelBody(response);
          throw new AuditError("redirect_chain_too_long", "The page redirected too many times.", 400);
        }

        let resolved: URL;
        try {
          resolved = new URL(location, current);
        } catch {
          await cancelBody(response);
          throw new AuditError("invalid_redirect", "The page returned an invalid redirect target.", 502);
        }

        let next: URL;
        try {
          next = parsePublicTarget(resolved.href);
        } catch (error) {
          await cancelBody(response);
          throw error;
        }
        await cancelBody(response);

        if (visited.has(next.href)) {
          throw new AuditError("redirect_loop", "The page returned a redirect loop.", 400);
        }
        visited.add(next.href);
        current = next;
        continue;
      }

      if (!response.ok) {
        await cancelBody(response);
        throw new AuditError("upstream_error", `The page returned HTTP ${response.status}.`, 502);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(contentType)) {
        await cancelBody(response);
        throw new AuditError("not_html", "The target did not return an HTML document.", 415);
      }

      const html = await readBoundedText(response);
      const mapped = requestAbortError(request);
      if (mapped) throw mapped;
      return {
        requestedUrl,
        canonicalUrl: current.href,
        html,
        fetchedAt: now().toISOString(),
      };
    } catch (error) {
      const mapped = requestAbortError(request);
      if (mapped) throw mapped;
      throw error;
    } finally {
      request.cleanup();
    }
  }
}
