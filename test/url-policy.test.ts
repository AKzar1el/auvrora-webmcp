import { describe, expect, it } from "vitest";
import { parsePublicTarget } from "../src/lib/audit/url-policy.ts";

function expectCode(input: unknown, code: string) {
  try {
    parsePublicTarget(input);
    throw new Error("expected parsePublicTarget to throw");
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

describe("parsePublicTarget", () => {
  it("accepts and normalizes a public HTTPS URL", () => {
    expect(parsePublicTarget("https://EXAMPLE.org/a#x").href).toBe("https://example.org/a");
    expect(parsePublicTarget("http://192.0.3.1/").href).toBe("http://192.0.3.1/");
  });

  it("accepts standard HTTP and HTTPS ports", () => {
    expect(parsePublicTarget("http://example.org:80/").href).toBe("http://example.org/");
    expect(parsePublicTarget("https://example.org:443/").href).toBe("https://example.org/");
  });

  it("rejects non-string, blank, malformed, and oversized inputs", () => {
    expectCode(null, "invalid_url");
    expectCode("   ", "invalid_url");
    expectCode("not a url", "invalid_url");
    expectCode(`https://example.org/${"a".repeat(2050)}`, "invalid_url");
  });

  it("rejects non-HTTP protocols and embedded credentials", () => {
    expect(() => parsePublicTarget("file:///etc/passwd")).toThrow(/HTTP or HTTPS/);
    expect(() => parsePublicTarget("https://user:pass@example.org/")).toThrow(/credentials/);
  });

  it("rejects non-standard ports", () => {
    expect(() => parsePublicTarget("https://example.org:8443/")).toThrow(/standard ports/);
    expectCode("https://example.org:8443/", "unsupported_port");
  });

  it("rejects literal private and reserved IPv4 targets", () => {
    for (const url of [
      "http://0.0.0.0/",
      "http://10.0.0.1/",
      "http://100.64.0.1/",
      "http://127.0.0.1/",
      "http://169.254.169.254/",
      "http://172.16.0.1/",
      "http://192.0.0.1/",
      "http://192.0.2.1/",
      "http://192.88.99.1/",
      "http://192.168.1.1/",
      "http://198.18.0.1/",
      "http://198.51.100.1/",
      "http://203.0.113.1/",
      "http://224.0.0.1/",
    ]) {
      expect(() => parsePublicTarget(url)).toThrow(/public/);
      expectCode(url, "private_url");
    }
  });

  it("rejects literal private and reserved IPv6 targets", () => {
    for (const url of [
      "http://[::]/",
      "http://[::1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://[2001:db8::1]/",
      "http://[ff02::1]/",
      "http://[::ffff:127.0.0.1]/",
    ]) {
      expect(() => parsePublicTarget(url)).toThrow(/public/);
      expectCode(url, "private_url");
    }
  });

  it("rejects local and non-public hostname classes", () => {
    for (const url of [
      "http://localhost/",
      "http://foo.localhost/",
      "http://foo.local/",
      "http://foo.internal/",
      "http://foo.home.arpa/",
      "http://foo.test/",
      "http://foo.invalid/",
      "http://foo.example/",
      "http://foo.onion/",
    ]) {
      expect(() => parsePublicTarget(url)).toThrow(/public/);
      expectCode(url, "private_url");
    }
  });
});
