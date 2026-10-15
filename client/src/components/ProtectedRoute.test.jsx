import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";

const mockUseAuth = vi.fn();
vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

function renderAt(path, { adminOnly = false } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/" element={<div>Home page</div>} />
        <Route path="/account" element={<div>Change temporary password</div>} />
        <Route
          path={path}
          element={
            <ProtectedRoute adminOnly={adminOnly}>
              <div>Secret content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  it.each(["admin", "guardian", "staff"])("allows %s to open portal notifications", role => {
    mockUseAuth.mockReturnValue({ user: { role }, status: "authenticated" });
    renderAt("/notifications");
    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });
  it.each(["/students", "/tests", "/fees", "/reports"])("allows a sub-admin to open %s", path => {
    mockUseAuth.mockReturnValue({ user: { role: "subadmin" }, status: "authenticated" });
    renderAt(path, { adminOnly: true });
    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });

  it.each(["/sub-admins", "/salaries", "/staff", "/archive", "/classes"])("blocks a sub-admin from opening %s directly", path => {
    mockUseAuth.mockReturnValue({ user: { role: "subadmin" }, status: "authenticated" });
    renderAt(path, { adminOnly: true });
    expect(screen.getByText("Home page")).toBeInTheDocument();
  });
  it("allows guardians with the legacy password-change flag to reach their portal", () => {
    mockUseAuth.mockReturnValue({ user: { role: "guardian", mustChangePassword: true }, status: "authenticated" });
    renderAt("/secret");
    expect(screen.getByText("Home page")).toBeInTheDocument();
  });
  it("shows a loading state while the session is still bootstrapping", () => {
    mockUseAuth.mockReturnValue({ user: null, status: "loading" });
    renderAt("/secret");
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("redirects an anonymous user to /login", () => {
    mockUseAuth.mockReturnValue({ user: null, status: "anonymous" });
    renderAt("/secret");
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("renders the protected content for an authenticated non-admin route", () => {
    mockUseAuth.mockReturnValue({ user: { role: "staff" }, status: "authenticated" });
    renderAt("/secret");
    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });

  it("redirects a non-admin user away from an adminOnly route", () => {
    mockUseAuth.mockReturnValue({ user: { role: "staff" }, status: "authenticated" });
    renderAt("/secret", { adminOnly: true });
    expect(screen.getByText("Home page")).toBeInTheDocument();
  });

  it("lets an admin through an adminOnly route", () => {
    mockUseAuth.mockReturnValue({ user: { role: "admin" }, status: "authenticated" });
    renderAt("/secret", { adminOnly: true });
    expect(screen.getByText("Secret content")).toBeInTheDocument();
  });

  it("redirects guardians away from teacher and other non-portal routes", () => {
    mockUseAuth.mockReturnValue({ user: { role: "guardian" }, status: "authenticated" });
    renderAt("/secret");
    expect(screen.getByText("Home page")).toBeInTheDocument();
  });
});
