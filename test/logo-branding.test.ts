import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("Auvrora public branding", () => {
  it("publishes a real header logo and favicon", async () => {
    const page = await readFile(join(root, "src/pages/index.astro"), "utf8");
    const mark = await readFile(join(root, "public/auvrora-mark.svg"), "utf8");
    const favicon = await readFile(join(root, "public/favicon.svg"), "utf8");

    expect(page).toContain('src="/auvrora-mark.svg"');
    expect(page).toContain('rel="icon" type="image/svg+xml" href="/favicon.svg"');
    expect(mark).toContain("<svg");
    expect(favicon).toContain('viewBox="0 0 64 64"');
  });
});
