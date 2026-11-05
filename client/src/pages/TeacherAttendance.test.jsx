import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import TeacherAttendance from "./TeacherAttendance";
import { teacherAttendanceApi } from "../api/attendance";

vi.mock("../components/AppLayout", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../api/attendance", () => ({ attendanceApi: { scan: vi.fn() }, teacherAttendanceApi: {
  scan: vi.fn(),
  list: vi.fn().mockResolvedValue({ items: [], total: 0, totalPages: 1 }),
  teachers: vi.fn().mockResolvedValue({ items: [{ _id: "teacher1", fullName: "Ayesha Khan", designation: { title: "Teacher" } }] }),
  mark: vi.fn().mockResolvedValue({ message: "Teacher attendance saved" }),
} }));

it("marks the selected teacher and refreshes records", async () => {
  render(<MemoryRouter initialEntries={["/teacher-attendance"]}><TeacherAttendance /></MemoryRouter>);
  expect(screen.getByRole("button", { name: "Mark present today" })).toBeDisabled();
  await screen.findByRole("option", { name: "Ayesha Khan — Teacher" });
  fireEvent.change(screen.getByLabelText("Teacher"), { target: { value: "teacher1" } });
  fireEvent.click(screen.getByRole("button", { name: "Mark present today" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Teacher attendance saved");
  expect(teacherAttendanceApi.mark).toHaveBeenCalledWith("teacher1");
  await waitFor(() => expect(teacherAttendanceApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ teacher: "teacher1" })));
});

it("opens teacher cards from attendance and returns to attendance records", () => {
  render(<MemoryRouter initialEntries={["/teacher-attendance"]}><TeacherAttendance /></MemoryRouter>);
  fireEvent.click(screen.getByRole("link", { name: "Teacher cards" }));
  expect(screen.getByText("Select a teacher to issue or edit their employee card.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mark present today" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "Attendance", exact: true }));
  expect(screen.getByRole("button", { name: "Mark present today" })).toBeInTheDocument();
});
