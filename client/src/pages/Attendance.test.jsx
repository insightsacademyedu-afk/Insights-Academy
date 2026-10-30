import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Attendance from "./Attendance";
import { attendanceApi } from "../api/attendance";
import { todayInKarachi } from "../lib/attendance";

const auth = vi.hoisted(() => ({ user: { role: "staff" } }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../components/AppLayout", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../components/StudentSelector", () => ({ default: () => null }));
vi.mock("../api/attendance", () => ({ attendanceApi: { list: vi.fn().mockResolvedValue({ items: [], total: 0, totalPages: 1 }) } }));
vi.mock("../api/academicSetup", () => ({ classesApi: { list: vi.fn().mockResolvedValue({ items: [] }) }, sectionsApi: { list: vi.fn().mockResolvedValue({ items: [] }) } }));

it("teachers can read student attendance without a scan action", async () => {
  auth.user.role = "staff";
  render(<Attendance />);
  expect(await screen.findByText(/No check-ins found/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Scan student card" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mark class attendance" })).not.toBeInTheDocument();
});

it("subadmin can scan student cards", async () => {
  auth.user.role = "subadmin";
  render(<Attendance />);
  expect(screen.getByRole("button", { name: "Scan student card" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mark class attendance" })).toBeInTheDocument();
  expect(await screen.findByText(/No check-ins found/)).toBeInTheDocument();
});

it("filters absent students for one day and keeps present history date controls separate", async () => {
  auth.user.role = "staff";
  attendanceApi.list.mockImplementation(params => Promise.resolve({ items: params.status === "absent" ? [{ _id: "absent1", student: { fullName: "Amina Ali", admissionNumber: "0042" }, day: params.day, className: "Class 9", sectionName: "A", status: "absent" }] : [], total: params.status === "absent" ? 1 : 0, totalPages: 1 }));
  render(<Attendance />);
  await screen.findByText(/No check-ins found/);
  fireEvent.change(screen.getByLabelText("Attendance status"), { target: { value: "absent" } });
  expect(await screen.findByText("Amina Ali")).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Absent" })).toBeInTheDocument();
  expect(attendanceApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: "absent", day: todayInKarachi() }));
  expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "All dates" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Attendance date"), { target: { value: "2026-10-01" } });
  await waitFor(() => expect(attendanceApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: "absent", day: "2026-10-01", page: 1 })));
  fireEvent.change(screen.getByLabelText("Attendance status"), { target: { value: "present" } });
  await screen.findByText(/No check-ins found/);
  expect(screen.getByLabelText("From")).toBeInTheDocument();
});
