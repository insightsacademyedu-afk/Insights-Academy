import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import TeacherCards from "./TeacherCards";
import StudentCards from "./StudentCards";
import { teacherCardsApi, studentCardsApi } from "../api/attendance";

vi.mock("../components/AppLayout", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../api/attendance", () => ({ teacherCardsApi: { get: vi.fn(), update: vi.fn(), action: vi.fn() }, teacherAttendanceApi: { teachers: vi.fn().mockResolvedValue({ items: [] }) }, studentCardsApi: { get: vi.fn() } }));
vi.mock("../api/students", () => ({ studentsApi: { list: vi.fn().mockResolvedValue({ items: [] }) } }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,cXI=") } }));
const data = {
  teacher: { _id: "42", fullName: "Ayesha Khan", status: "active", designation: { title: "Mathematics Teacher" }, photoUrl: "" },
  employeeId: "EMP-0042",
  card: { _id: "card1", token: "AMT1_first", status: "active", effectiveStatus: "active", version: 1, issuedAt: "2026-10-30T19:00:00Z", expiresAt: "2027-10-30T19:00:00Z" }, history: [],
};
beforeEach(() => { vi.clearAllMocks(); teacherCardsApi.get.mockResolvedValue(data); });
const show = () => render(<MemoryRouter initialEntries={["/teacher-cards?teacher=42"]}><TeacherCards /></MemoryRouter>);

it("shows the employee card with designation and QR, without guardian or phone details", async () => {
  show();
  expect(await screen.findByText("Mathematics Teacher")).toBeInTheDocument();
  expect(await screen.findByAltText("Teacher attendance QR code")).toBeInTheDocument();
  expect(screen.getByText("Employee ID: EMP-0042")).toBeInTheDocument();
  expect(screen.queryByText(/Guardian phone/)).not.toBeInTheDocument();
  expect(screen.getByText("EMPLOYEE IDENTITY CARD").parentElement).toHaveClass("bg-[#1e2a44]", "border-[#b07f22]");
});

it("edits name and designation and retains the employee identity", async () => {
  teacherCardsApi.update.mockResolvedValue({ ...data, teacher: { ...data.teacher, fullName: "Ayesha Ali", cardDesignation: "Senior Teacher" } });
  show();
  fireEvent.click(await screen.findByRole("button", { name: "Edit card details" }));
  fireEvent.change(screen.getByLabelText(/Teacher name/), { target: { value: "Ayesha Ali" } });
  fireEvent.change(screen.getByLabelText(/Designation/), { target: { value: "Senior Teacher" } });
  expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save card details" }));
  expect(await screen.findByText("Senior Teacher")).toBeInTheDocument();
  expect(teacherCardsApi.update).toHaveBeenCalledWith("42", { fullName: "Ayesha Ali", cardDesignation: "Senior Teacher", photoUrl: "" });
  expect(screen.getByText("Employee ID: EMP-0042")).toBeInTheDocument();
});

it("applies the same approved navy and gold header to student cards", async () => {
  studentCardsApi.get.mockResolvedValue({ student: { fullName: "Ahmed Ali", admissionNumber: "0042", guardian: { primaryPhone: "03001234567" } }, card: { ...data.card, className: "Class 9", sectionName: "A" }, history: [] });
  render(<MemoryRouter initialEntries={["/student-cards?student=42"]}><StudentCards /></MemoryRouter>);
  const heading = await screen.findByText("STUDENT IDENTITY CARD");
  expect(heading.parentElement).toHaveClass("bg-[#1e2a44]", "border-[#b07f22]");
  expect(screen.getByText("03001234567")).toBeInTheDocument();
});
