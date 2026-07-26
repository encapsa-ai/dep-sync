import { describe, expect, it } from "vitest";
import { displayVersion, packageShortName } from "./semver";

describe("displayVersion", () => {
  it("prefixes semver and preserves sentinel labels", () => {
    expect(displayVersion("1.2.3")).toBe("v1.2.3");
    expect(displayVersion("unversioned")).toBe("unversioned");
    expect(displayVersion("unknown")).toBe("unknown");
  });
});

describe("packageShortName", () => {
  it("returns the final package segment", () => {
    expect(packageShortName("@page-speed/img")).toBe("img");
    expect(packageShortName("app")).toBe("app");
  });
});

