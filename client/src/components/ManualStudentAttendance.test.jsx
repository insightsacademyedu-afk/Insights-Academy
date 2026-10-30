import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import ManualStudentAttendance from "./ManualStudentAttendance";
import { attendanceApi } from "../api/attendance";
import { sectionsApi } from "../api/academicSetup";

vi.mock("../api/attendance", () => ({ attendanceApi: { roster: vi.fn(), mark: vi.fn() } }));
vi.mock("../api/academicSetup", () => ({ sectionsApi: { list: vi.fn() } }));
const classes = [{ _id: "class1", name: "Class 9" }, { _id: "class2", name: "Class 10" }];
const roster = { day: "2026-10-31", items: [
  { _id: "student1", student: { fullName: "Amina", admissionNumber: "0042" }, sectionName: "A", attendance: null },
  { _id: "student2", student: { fullName: "Ahmed", admissionNumber: "0043" }, sectionName: "A", attendance: { checkedInAt: "2026-10-31T03:00:00Z", method: "qr" } },
], total: 2, totalPages: 1 };
beforeEach(() => { vi.clearAllMocks(); sectionsApi.list.mockResolvedValue({ items: [{ _id: "section1", name: "A" }] }); attendanceApi.roster.mockResolvedValue(roster); });

it("loads the selected class and marks only selected unmarked students for today", async () => {
  attendanceApi.mark.mockResolvedValue({ marked: 1, alreadyMarked: 0, message: "1 marked present" });
  const onSaved = vi.fn();
  render(<ManualStudentAttendance classes={classes} onSaved={onSaved} />);
  expect(attendanceApi.roster).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Class for manual attendance"), { target: { value: "class1" } });
  expect(await screen.findByText("Amina")).toBeInTheDocument();
  expect(screen.getByLabelText("Select Ahmed")).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Select unmarked students on this page"));
  fireEvent.click(screen.getByRole("button", { name: "Mark selected present (1)" }));
  expect(await screen.findByRole("status")).toHaveTextContent("1 marked present");
  expect(attendanceApi.mark).toHaveBeenCalledWith({ class: "class1", students: ["student1"], day: "2026-10-31" });
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it("clears selections when changing class or section and preserves selection after a save failure", async () => {
  attendanceApi.mark.mockRejectedValue({ message: "Student is no longer in this class. Refresh the roster." });
  render(<ManualStudentAttendance classes={classes} initialClass="class1" />);
  await screen.findByText("Amina");
  await screen.findByRole("option", { name: "A" });
  fireEvent.click(screen.getByLabelText("Select Amina"));
  fireEvent.change(screen.getByLabelText("Section for manual attendance"), { target: { value: "section1" } });
  await waitFor(() => expect(attendanceApi.roster).toHaveBeenLastCalledWith(expect.objectContaining({ class: "class1", section: "section1", page: 1 })));
  expect(screen.getByRole("button", { name: "Mark selected present (0)" })).toBeDisabled();
  await screen.findByText("Amina");
  fireEvent.click(screen.getByLabelText("Select Amina"));fireEvent.click(screen.getByRole("button", { name: "Mark selected present (1)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Refresh the roster");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Class for manual attendance"), { target: { value: "class2" } });
  expect(screen.getByRole("button", { name: "Mark selected present (0)" })).toBeDisabled();
});
