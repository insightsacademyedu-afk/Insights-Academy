import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import StudentCardDirectory from "./StudentCardDirectory";
import { classesApi } from "../api/academicSetup";
import { studentsApi } from "../api/students";
import { exportStudentCards } from "../lib/exportStudentCards";

vi.mock("../api/academicSetup", () => ({ classesApi: { list: vi.fn() } }));
vi.mock("../api/students", () => ({ studentsApi: { list: vi.fn() } }));
vi.mock("../lib/exportStudentCards", () => ({ exportStudentCards: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  classesApi.list.mockResolvedValue({ items: [{ _id: "class9", name: "Class 9" }], totalPages: 1 });
  studentsApi.list.mockResolvedValue({ items: [{ _id: "student1", fullName: "Amina", admissionNumber: "0042" }], total: 21, totalPages: 2 });
});
it("combines class and name search, paginates and selects a card", async () => {
  const onSelect = vi.fn();
  render(<StudentCardDirectory onSelect={onSelect} />);
  await screen.findByRole("option", { name: "Class 9" });
  fireEvent.change(screen.getByLabelText("Filter cards by class"), { target: { value: "class9" } });
  fireEvent.change(screen.getByLabelText("Search cards"), { target: { value: "Amina" } });
  fireEvent.change(screen.getByLabelText("Filter by card or student status"), { target: { value: "recent" } });
  await waitFor(() => expect(studentsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ class: "class9", search: "Amina", cardFilter: "recent", sortBy: "createdAt", sortDir: "desc", page: 1 })));
  fireEvent.click(await screen.findByRole("button", { name: "Next page" }));
  await waitFor(() => expect(studentsApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ class: "class9", search: "Amina", page: 2 })));
  fireEvent.click(await screen.findByRole("button", { name: "View card" }));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ _id: "student1" }));
});
it("selects all matching pages and exports with filters and exclusions", async () => {
  exportStudentCards.mockResolvedValue({ count: 10, skipped: ["Ahmed (0043)"] });
  render(<StudentCardDirectory onSelect={vi.fn()} />);
  await screen.findByRole("option", { name: "Class 9" });
  fireEvent.change(screen.getByLabelText("Filter cards by class"), { target: { value: "class9" } });
  fireEvent.change(screen.getByLabelText("Search cards"), { target: { value: "Amina" } });
  const student = await screen.findByRole("checkbox", { name: "Amina (0042)" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all matching students" }));
  expect(student).toBeChecked();
  fireEvent.click(student);
  fireEvent.click(screen.getByRole("button", { name: "Download bulk PDF (A4)" }));
  expect(await screen.findByText(/Downloaded 10 cards on 2 A4 pages/)).toBeInTheDocument();
  expect(exportStudentCards).toHaveBeenCalledWith(expect.objectContaining({
    classId: "class9", filters: { search: "Amina", cardFilter: "" }, excludedIds: new Set(["student1"]),
  }));
  expect(screen.getByText("Ahmed (0043)")).toBeInTheDocument();
});

it("exports only the students checked individually", async () => {
  exportStudentCards.mockResolvedValue({ count: 1, skipped: [] });
  render(<StudentCardDirectory onSelect={vi.fn()} />);
  const download = screen.getByRole("button", { name: "Download bulk PDF (A4)" });
  expect(download).toBeDisabled();
  fireEvent.click(await screen.findByRole("checkbox", { name: "Amina (0042)" }));
  fireEvent.click(download);
  expect(await screen.findByText(/Downloaded 1 cards/)).toBeInTheDocument();
  expect(exportStudentCards).toHaveBeenCalledWith(expect.objectContaining({
    students: [{ _id: "student1", fullName: "Amina", admissionNumber: "0042" }],
  }));
});
