import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const scannedRoots = ["src", "docs", "evals"];
const scannedRootFiles = ["README.md", "package.json", "package-lock.json", "wrangler.jsonc"];
const textExtensions = new Set([".astro", ".css", ".html", ".js", ".json", ".jsonc", ".md", ".mjs", ".ts", ".yml", ".yaml"]);

async function collectTextFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTextFiles(fullPath)));
    } else if (textExtensions.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Auvrora brand consistency", () => {
  it("contains no stale LoopFix branding, URLs, slugs, or brand-specific filenames", async () => {
    const files = [
      ...scannedRootFiles.map((file) => join(root, file)),
      ...(await Promise.all(scannedRoots.map((dir) => collectTextFiles(join(root, dir))))).flat(),
    ];

    const stale = /LoopFix|loopfix-webmcp|AKzar1el\/loopfix-mcp|loopfix-client/i;
    const offenders: string[] = [];

    for (const file of files) {
      const path = relative(root, file);
      if (stale.test(path) || stale.test(await readFile(file, "utf8"))) {
        offenders.push(path);
      }
    }

    expect(offenders, `stale brand references: ${offenders.join(", ")}`).toEqual([]);
  });

  it("uses the final Auvrora identity in public package and deployment metadata", async () => {
    const readme = await readFile(join(root, "README.md"), "utf8");
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { name: string };
    const wrangler = await readFile(join(root, "wrangler.jsonc"), "utf8");

    expect(packageJson.name).toBe("auvrora-webmcp");
    expect(wrangler).toContain('"name": "auvrora-webmcp"');
    expect(readme).toContain("# Auvrora WebMCP");
    expect(readme).toContain("https://auvrora-webmcp.tomi-seregi99.workers.dev");
    expect(readme).toContain("https://github.com/AKzar1el/auvrora-webmcp.git");
    expect(basename(root)).not.toBe("");
  });
});
