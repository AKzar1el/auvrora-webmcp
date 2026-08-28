import { AuditError } from "./types.ts";

const MAX_URL_LENGTH = 2_048;
const BLOCKED_NAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);
const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".test",
  ".invalid",
  ".example",
  ".onion",
];

function invalidUrl(message = "Enter a complete public HTTP or HTTPS URL."): never {
  throw new AuditError("invalid_url", message, 400);
}

function privateUrl(): never {
  throw new AuditError("private_url", "That hostname is not a public web address.", 400);
}

function ipv4Parts(hostname: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null;
  const parts = hostname.split(".").map(Number);
  return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = ipv4Parts(hostname);
  if (!parts) return false;
  const [a, b, c] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function expandIpv6(hostname: string): number[] | null {
  const value = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!value.includes(":")) return null;

  const halves = value.split("::");
  if (halves.length > 2) return null;

  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const groups = half.split(":");
    const parsed: number[] = [];
    for (const group of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      parsed.push(Number.parseInt(group, 16));
    }
    return parsed;
  };

  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) return null;

  if (halves.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function isBlockedIpv6(hostname: string): boolean {
  const groups = expandIpv6(hostname);
  if (!groups) return false;

  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const isUnspecifiedOrLoopback = groups.slice(0, 7).every((group) => group === 0) && (g7 === 0 || g7 === 1);
  const isUniqueLocal = (g0 & 0xfe00) === 0xfc00;
  const isLinkLocal = (g0 & 0xffc0) === 0xfe80;
  const isDocumentation = g0 === 0x2001 && g1 === 0x0db8;
  const isMulticast = (g0 & 0xff00) === 0xff00;

  const isMappedIpv4 = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff;
  const mappedIpv4Blocked = isMappedIpv4
    ? isBlockedIpv4(`${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`)
    : false;

  return isUnspecifiedOrLoopback || isUniqueLocal || isLinkLocal || isDocumentation || isMulticast || mappedIpv4Blocked;
}

export function parsePublicTarget(input: unknown): URL {
  if (typeof input !== "string" || input.trim().length === 0) invalidUrl();
  if (input.length > MAX_URL_LENGTH) invalidUrl("The URL is too long.");

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    invalidUrl();
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    invalidUrl("Only HTTP or HTTPS URLs are supported.");
  }
  if (url.username || url.password) {
    invalidUrl("URLs containing credentials are not allowed.");
  }
  if (url.port) {
    throw new AuditError("unsupported_port", "Only standard ports 80 and 443 are supported.", 400);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    BLOCKED_NAMES.has(hostname) ||
    BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    isBlockedIpv4(hostname) ||
    isBlockedIpv6(hostname)
  ) {
    privateUrl();
  }

  url.hostname = hostname.includes(":") ? `[${hostname}]` : hostname;
  url.hash = "";
  return url;
}
