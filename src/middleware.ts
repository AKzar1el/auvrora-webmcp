import { defineMiddleware } from "astro:middleware";
import { applySecurityHeaders } from "./lib/security/headers.ts";

export const onRequest = defineMiddleware(async (_context, next) => {
  return applySecurityHeaders(await next());
});
