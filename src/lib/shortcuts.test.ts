import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as platform from "./platform";
import { isRescanShortcut, type KeyboardShortcutEvent } from "./shortcuts";

const event = (
  overrides: Partial<KeyboardShortcutEvent> = {},
): KeyboardShortcutEvent => ({
  key: "r",
  metaKey: true,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...overrides,
});

describe("isRescanShortcut", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("on Mac", () => {
    beforeEach(() => {
      vi.spyOn(platform, "isMac").mockReturnValue(true);
    });

    it("accepts Command-R regardless of key casing", () => {
      expect(isRescanShortcut(event())).toBe(true);
      expect(isRescanShortcut(event({ key: "R" }))).toBe(true);
    });

    it("rejects Control-R to avoid browser-refresh confusion", () => {
      expect(
        isRescanShortcut(event({ metaKey: false, ctrlKey: true })),
      ).toBe(false);
    });
  });

  describe("on non-Mac platforms", () => {
    beforeEach(() => {
      vi.spyOn(platform, "isMac").mockReturnValue(false);
    });

    it("accepts Control-R regardless of key casing", () => {
      expect(
        isRescanShortcut(event({ metaKey: false, ctrlKey: true })),
      ).toBe(true);
      expect(
        isRescanShortcut({ ...event(), key: "R", metaKey: false, ctrlKey: true }),
      ).toBe(true);
    });

    it("rejects Meta-R so Windows-R remains an operating system shortcut", () => {
      expect(isRescanShortcut(event())).toBe(false);
    });
  });

  it("rejects missing or combined modifiers, other modifiers, and repeats", () => {
    vi.spyOn(platform, "isMac").mockReturnValue(true);

    expect(isRescanShortcut(event({ metaKey: false }))).toBe(false);
    expect(isRescanShortcut(event({ ctrlKey: true }))).toBe(false);
    expect(isRescanShortcut(event({ shiftKey: true }))).toBe(false);
    expect(isRescanShortcut(event({ altKey: true }))).toBe(false);
    expect(isRescanShortcut(event({ repeat: true }))).toBe(false);
    expect(isRescanShortcut(event({ key: "e" }))).toBe(false);
  });
});
