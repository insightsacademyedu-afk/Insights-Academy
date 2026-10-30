import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import Attendance from "./Attendance";
import { attendanceApi } from "../api/attendance";
import { studentsApi } from "../api/students";
import { todayInKarachi } from "../lib/attendance";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { role: "subadmin" } }) }));
vi.mock("../components/AppLayout", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../api/attendance", () => ({ attendanceApi: { list: vi.fn(), markStudent: vi.fn() } }));
vi.mock("../api/students", () => ({ studentsApi: { list: vi.fn() } }));
vi.mock("../api/academicSetup", () => ({ classesApi: { list: vi.fn().mockResolvedValue({ items: [{ _id: "class1", name: "Class 9" }] }) }, sectionsApi: { list: vi.fn() } }));
const student = { _id: "student1", fullName: "Amina", admissionNumber: "0042" };
const empty = { items: [], total: 0, totalPages: 1 };
beforeEach(() => { vi.clearAllMocks(); attendanceApi.list.mockResolvedValue(empty); studentsApi.list.mockResolvedValue({ items: [student] }); });

async function selectStudent() {
  fireEvent.change(screen.getByLabelText("Search students"), { target: { value: "Ami" } });
  fireEvent.click(await screen.findByRole("button", { name: "Amina 0042" }));
}

it("marks a student selected through the real search control even when they have no attendance records", async () => {
  attendanceApi.markStudent.mockResolvedValue({ message: "Student attendance saved", marked: 1 });
  render(<Attendance />);
  expect(screen.getByRole("button", { name: "Mark present today" })).toBeDisabled();
  await selectStudent();
  expect(await screen.findByText(/No check-ins found/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Mark present today" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Amina: Student attendance saved");
  expect(attendanceApi.markStudent).toHaveBeenCalledWith({ student: "student1", day: todayInKarachi() });
  await waitFor(() => expect(attendanceApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ student: "student1" })));
});

it("marks a filtered absent student directly and refreshes the absent list", async () => {
  let marked = false;
  attendanceApi.list.mockImplementation(params => Promise.resolve(params.status === "absent" && !marked ? { items: [{ _id: "absent1", student, class: "class1", className: "Class 9", sectionName: "A", day: todayInKarachi(), status: "absent" }], total: 1, totalPages: 1 } : empty));
  attendanceApi.markStudent.mockImplementation(async () => { marked = true; return { message: "Student attendance saved" }; });
  render(<Attendance />);
  fireEvent.change(screen.getByLabelText("Attendance status"), { target: { value: "absent" } });
  fireEvent.click(await screen.findByRole("button", { name: "Mark Amina present today" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Student attendance saved");
  expect(attendanceApi.markStudent).toHaveBeenCalledWith({ student: "student1", class: "class1", day: todayInKarachi() });
  expect(await screen.findByText(/No absent students found/)).toBeInTheDocument();
});

it("respects the class filter and displays duplicate or failed marking results", async () => {
  attendanceApi.markStudent.mockResolvedValueOnce({ message: "Already marked today", alreadyMarked: 1 }).mockRejectedValueOnce({ message: "Student is no longer in the selected class" });
  render(<Attendance />);
  await selectStudent();
  await screen.findByRole("option", { name: "Class 9" });
  fireEvent.change(screen.getByLabelText("Class"), { target: { value: "class1" } });
  fireEvent.click(screen.getByRole("button", { name: "Mark present today" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Already marked today");
  expect(attendanceApi.markStudent).toHaveBeenCalledWith({ student: "student1", class: "class1", day: todayInKarachi() });
  fireEvent.click(screen.getByRole("button", { name: "Mark present today" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("no longer in the selected class");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
