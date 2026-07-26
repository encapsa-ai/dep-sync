import { describe, expect, it } from "vitest";
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
  it("accepts Command-R regardless of key casing", () => {
    expect(isRescanShortcut(event())).toBe(true);
    expect(isRescanShortcut(event({ key: "R" }))).toBe(true);
  });

  it("rejects reload variants, other modifiers, and key repeats", () => {
    expect(isRescanShortcut(event({ metaKey: false }))).toBe(false);
    expect(isRescanShortcut(event({ shiftKey: true }))).toBe(false);
    expect(isRescanShortcut(event({ altKey: true }))).toBe(false);
    expect(isRescanShortcut(event({ ctrlKey: true }))).toBe(false);
    expect(isRescanShortcut(event({ repeat: true }))).toBe(false);
    expect(isRescanShortcut(event({ key: "e" }))).toBe(false);
  });
});

