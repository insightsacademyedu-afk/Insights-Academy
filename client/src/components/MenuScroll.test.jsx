import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: { _id: "menu-scroll-test", role: "admin" } }),
}));
vi.mock("../context/academy", () => ({
  useAcademy: () => ({ settings: { academyName: "Academy" } }),
}));

function FirstPage() { return <Sidebar />; }
function SecondPage() { return <Sidebar />; }
function MobilePage() {
  const [open, setOpen] = useState(true);
  return <>
    <button onClick={() => setOpen(true)}>Open menu</button>
    <MobileNav open={open} onClose={() => setOpen(false)} />
  </>;
}

describe("menu scroll position", () => {
  it("keeps the desktop menu position when a link mounts a different page", () => {
    render(<MemoryRouter><Routes>
      <Route path="/" element={<FirstPage />} />
      <Route path="/reports" element={<SecondPage />} />
    </Routes></MemoryRouter>);
    const previousMenu = screen.getByRole("navigation", { name: "Main navigation" });
    fireEvent.scroll(previousMenu, { target: { scrollTop: 320 } });
    fireEvent.click(screen.getByRole("link", { name: "Reports" }));
    const nextMenu = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nextMenu).not.toBe(previousMenu);
    expect(nextMenu.scrollTop).toBe(320);
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps the mobile menu position after selecting a link and reopening", () => {
    render(<MemoryRouter><MobilePage /></MemoryRouter>);
    const previousMenu = screen.getByRole("navigation").parentElement;
    fireEvent.scroll(previousMenu, { target: { scrollTop: 240 } });
    fireEvent.click(screen.getByRole("link", { name: "Reports" }));
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("navigation").parentElement.scrollTop).toBe(240);
  });
});
