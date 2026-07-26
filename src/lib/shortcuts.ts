import { isMac } from "./platform";

export interface KeyboardShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

export function isRescanShortcut(event: KeyboardShortcutEvent): boolean {
  if (event.altKey || event.shiftKey || event.repeat) return false;
  if (event.key.toLowerCase() !== "r") return false;

  if (isMac()) {
    return event.metaKey && !event.ctrlKey;
  }

  return event.ctrlKey && !event.metaKey;
}
