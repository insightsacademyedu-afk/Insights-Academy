import { vi, test, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import GuardianPortal from "./GuardianPortal";
import { guardianPortalApi } from "../api/guardians";
import { NAV_SECTIONS, canAccessNav } from "../lib/nav";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { displayName: "Parent One", role: "guardian" }, isAdmin: false }) }));
vi.mock("../api/guardians", () => ({ guardianPortalApi: { children: vi.fn(), overview: vi.fn(), records: vi.fn() } }));
const children = [{ _id: "child-1", fullName: "Child One", admissionNumber: "0001" }, { _id: "child-2", fullName: "Child Two", admissionNumber: "0002" }];
beforeEach(() => {
  vi.resetAllMocks();
  guardianPortalApi.children.mockResolvedValue({ items: children });
  guardianPortalApi.overview.mockImplementation(id => Promise.resolve({ student: children.find(child => child._id === id), placement: null, outstanding: 600 }));
  guardianPortalApi.records.mockImplementation((id, kind) => Promise.resolve({ items: kind === "tests" ? [{
    _id: `result-${id}`, test: { title: `Report ${id}`, maxMarks: 100, testDate: "2026-10-15" }, marksObtained: 85,
    summary: { grade: "A", percentage: 85, passed: true }, remarks: "Well done",
  }] : kind === "payments" ? [{ _id: "payment-1", receiptNumber: "RECEIPT-001", amount: 400, method: "cash", paidAt: "2026-10-15" }] : [], total: kind === "invoices" ? 0 : 1, totalPages: 1 }));
});
const mount = () => render(<MemoryRouter><GuardianPortal /></MemoryRouter>);

test("guardian navigation contains only their dashboard and account", () => {
  expect(NAV_SECTIONS.flatMap(section => section.items).filter(item => canAccessNav(item, "guardian")).map(item => item.to).sort()).toEqual(["/", "/account"]);
});

test("guardian can switch children and view only the selected child's reports and payments", async () => {
  mount(); const user = userEvent.setup();
  expect(await screen.findByText("Report child-1")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Students" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Staff & Teachers" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Payment history" }));
  expect(await screen.findByText("RECEIPT-001")).toBeInTheDocument();
  expect(guardianPortalApi.records).toHaveBeenCalledWith("child-1", "payments", 1);
  await user.selectOptions(screen.getByRole("combobox", { name: "Child" }), "child-2");
  expect(await screen.findByText("Report child-2")).toBeInTheDocument();
  expect(screen.queryByText("RECEIPT-001")).not.toBeInTheDocument();
  expect(screen.queryByText("Report child-1")).not.toBeInTheDocument();
  await waitFor(() => expect(guardianPortalApi.overview).toHaveBeenCalledWith("child-2"));
});

test("a guardian with no current children gets a clear message", async () => {
  guardianPortalApi.children.mockResolvedValue({ items: [] });
  mount();
  expect(await screen.findByText(/No children are currently linked/)).toBeInTheDocument();
  expect(guardianPortalApi.overview).not.toHaveBeenCalled();
});
