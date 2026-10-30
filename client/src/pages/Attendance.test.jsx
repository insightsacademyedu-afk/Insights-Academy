import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Attendance from "./Attendance";

const auth = vi.hoisted(() => ({ user: { role: "staff" } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../components/AppLayout", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../components/StudentSelector", () => ({ default: () => null }));
vi.mock("../api/attendance", () => ({ attendanceApi: { list: vi.fn().mockResolvedValue({ items: [], total: 0, totalPages: 1 }) } }));
vi.mock("../api/academicSetup", () => ({ classesApi: { list: vi.fn().mockResolvedValue({ items: [] }) } }));

it("teachers can read student attendance without a scan action", async () => {
  auth.user.role = "staff";
  render(<Attendance />);
  expect(await screen.findByText(/No check-ins found/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Scan student card" })).not.toBeInTheDocument();
});

it("subadmin can scan student cards", async () => {
  auth.user.role = "subadmin";
  render(<Attendance />);
  expect(screen.getByRole("button", { name: "Scan student card" })).toBeInTheDocument();
  expect(await screen.findByText(/No check-ins found/)).toBeInTheDocument();
});
