import { describe, expect, it } from "vitest";
import { demoAfter } from "../src/demo/after.ts";
import { demoBefore } from "../src/demo/before.ts";
import { compareSelectedFindings } from "../src/lib/app/verification.ts";

describe("deterministic demo fixtures", () => {
  it("uses a reserved non-live target and demonstrates mixed verification outcomes", () => {
    expect(demoBefore.canonicalUrl).toBe("https://demo.loopfix.example/");
    expect(demoBefore.findings.length >= 4).toBeTruthy();

    const selected = [
      "finding:missing_title",
      "finding:missing_h1",
      "finding:images_missing_alt",
    ];
    expect(compareSelectedFindings(selected, demoBefore, demoAfter)).toEqual([
      { findingId: "finding:missing_title", status: "fixed" },
      { findingId: "finding:missing_h1", status: "fixed" },
      { findingId: "finding:images_missing_alt", status: "still_present" },
    ]);
  });
});
