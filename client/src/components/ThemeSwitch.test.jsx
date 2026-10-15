import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeSwitch from "./ThemeSwitch";

const bootstrap = readFileSync("public/theme.js", "utf8");

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme switch", () => {
  it("switches both controls together and persists the selected theme", () => {
    render(<><ThemeSwitch /><ThemeSwitch /></>);
    const switches = screen.getAllByRole("switch", { name: "Dark theme" });
    fireEvent.click(switches[0]);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("academy-theme")).toBe("dark");
    switches.forEach(control => expect(control).toHaveAttribute("aria-checked", "true"));
    fireEvent.click(switches[1]);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("academy-theme")).toBe("light");
  });

  it("restores the saved theme before mounting the app", () => {
    localStorage.setItem("academy-theme", "dark");
    new Function("document", "localStorage", bootstrap)(document, localStorage);
    render(<ThemeSwitch />);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("keeps switching when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    render(<ThemeSwitch />);
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("updates the theme when the preference changes in another tab", () => {
    render(<ThemeSwitch />);
    fireEvent(window, new StorageEvent("storage", { key: "academy-theme", newValue: "dark" }));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    fireEvent(window, new StorageEvent("storage", { key: "academy-theme", newValue: null }));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
});
