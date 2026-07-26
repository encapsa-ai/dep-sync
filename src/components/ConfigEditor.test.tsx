// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../lib/types";
import { ConfigEditor } from "./ConfigEditor";

afterEach(cleanup);

describe("ConfigEditor", () => {
  it("preserves focus while editing a package name", () => {
    const config: Config = {
      packages: [
        {
          name: "app",
          path: "/code/customer-sites",
          kind: "application",
          scope: null,
        },
      ],
      settings: {
        dep_fields: ["dependencies"],
        terminal_command: "",
      },
    };

    render(
      <ConfigEditor
        open
        config={config}
        configPath="/config/dep-sync.json"
        saving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onReveal={vi.fn()}
      />,
    );

    const nameInput = screen.getByLabelText("Package 1 name");
    nameInput.focus();
    fireEvent.change(nameInput, { target: { value: "appx" } });

    expect(screen.getByLabelText("Package 1 name")).toBe(nameInput);
    expect(nameInput).toHaveProperty("value", "appx");
    expect(document.activeElement).toBe(nameInput);
  });
});
