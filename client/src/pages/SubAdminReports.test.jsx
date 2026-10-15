import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Reports from "./Reports";

vi.mock("../components/AppLayout", () => ({ default: ({ children }) => <main>{children}</main> }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { role: "subadmin" } }) }));
vi.mock("../context/ToastContext", () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock("../api/students", () => ({ studentsApi: { list: vi.fn() } }));
vi.mock("../api/reports", () => ({
  fetchStudentsReport: vi.fn(), fetchFeeCollectionReport: vi.fn(), fetchOutstandingFeesReport: vi.fn(),
  fetchExpensesReport: vi.fn(), downloadReportCsv: vi.fn(),
}));
import { studentsApi } from "../api/students";
import { fetchStudentsReport, fetchFeeCollectionReport, fetchOutstandingFeesReport, fetchExpensesReport, downloadReportCsv } from "../api/reports";

beforeEach(() => {
  vi.clearAllMocks();
  studentsApi.list.mockResolvedValue({ items: [{ _id: "student1", fullName: "Selected Child", admissionNumber: "A-1" }] });
  fetchStudentsReport.mockResolvedValue({ items: [], total: 0 });
  fetchFeeCollectionReport.mockResolvedValue({ items: [], total: 1000, count: 1 });
  fetchOutstandingFeesReport.mockResolvedValue({ items: [], totalOutstanding: 500, count: 1 });
  downloadReportCsv.mockResolvedValue();
});

test("sub-admin fee reports and CSV exports require a selected student", async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><Reports /></MemoryRouter>);
  await user.click(screen.getByRole("button", { name: "Fee Collection" }));
  expect(fetchFeeCollectionReport).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /Download CSV/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Expenses" })).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Search students"), "Selected");
  await user.click(await screen.findByRole("button", { name: /Selected Child A-1/ }));
  await waitFor(() => expect(fetchFeeCollectionReport).toHaveBeenCalledWith(expect.objectContaining({ student: "student1" })));
  await user.click(await screen.findByRole("button", { name: /Download CSV/ }));
  expect(downloadReportCsv).toHaveBeenCalledWith("/reports/fee-collection", expect.objectContaining({ student: "student1" }), "fee-collection-report.csv");
  await user.click(screen.getByRole("button", { name: "Outstanding Fees" }));
  await waitFor(() => expect(fetchOutstandingFeesReport).toHaveBeenCalledWith({ student: "student1" }));
  await user.click(await screen.findByRole("button", { name: /Download CSV/ }));
  expect(downloadReportCsv).toHaveBeenCalledWith("/reports/outstanding-fees", { student: "student1" }, "outstanding-fees-report.csv");
  await user.click(screen.getByLabelText("Clear student filter"));
  expect(screen.queryByText("Student outstanding")).not.toBeInTheDocument();
  expect(fetchExpensesReport).not.toHaveBeenCalled();
});

test("sub-admin reports include access to test reports", async () => {
  render(<MemoryRouter><Reports /></MemoryRouter>);
  await userEvent.setup().click(screen.getByRole("button", { name: "Test reports" }));
  expect(screen.getByRole("link", { name: /Open test reports/ })).toHaveAttribute("href", "/tests");
});
