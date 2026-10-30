import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import GuardianPortal from "./GuardianPortal";
import { guardianPortalApi } from "../api/guardians";

vi.mock("../components/AppLayout", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../api/guardians", () => ({ guardianPortalApi: { children: vi.fn(), overview: vi.fn(), records: vi.fn() } }));

it("shows the linked child's daily attendance through the dedicated parent endpoint", async () => {
  guardianPortalApi.children.mockResolvedValue({ items: [{ _id: "child1", fullName: "Amina", admissionNumber: "0042" }] });
  guardianPortalApi.overview.mockResolvedValue({ student: { fullName: "Amina", admissionNumber: "0042" }, outstanding: 0 });
  guardianPortalApi.records.mockImplementation((id, kind) => Promise.resolve({ items: kind === "attendance" ? [{ _id: "attendance1", day: "2026-10-30", checkedInAt: "2026-10-30T03:12:00Z", className: "Class 9", sectionName: "A" }] : [], total: kind === "attendance" ? 1 : 0, totalPages: 1 }));
  render(<GuardianPortal />);
  fireEvent.click(await screen.findByRole("button", { name: "Attendance" }));
  expect(await screen.findByText("2026-10-30")).toBeInTheDocument();
  expect(screen.getByText("Class 9 / A")).toBeInTheDocument();
  expect(screen.getByText("Present")).toBeInTheDocument();
  expect(guardianPortalApi.records).toHaveBeenCalledWith("child1", "attendance", 1);
  expect(screen.queryByRole("button", { name: "Mark attendance" })).not.toBeInTheDocument();
});
