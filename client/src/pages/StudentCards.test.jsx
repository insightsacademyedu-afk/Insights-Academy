import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import StudentCards from "./StudentCards";
import { studentCardsApi } from "../api/attendance";
import { studentsApi } from "../api/students";

vi.mock("../components/AppLayout", () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock("../api/attendance", () => ({ studentCardsApi: { get: vi.fn(), action: vi.fn() } }));
vi.mock("../components/StudentCardDirectory", () => ({ default: () => null }));
vi.mock("../api/students", () => ({ studentsApi: { list: vi.fn(), update: vi.fn() } }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,cXI=") } }));

const data = {
  student: { _id: "42", fullName: "Ahmed Ali", admissionNumber: "0042", guardian: { primaryPhone: "03001234567" } },
  card: { _id: "card1", token: "AMS1_first", status: "active", effectiveStatus: "active", version: 1, className: "Class 9", sectionName: "A", sessionName: "2026", issuedAt: "2026-10-29T19:00:00Z", expiresAt: "2027-10-29T19:00:00Z" },
  history: [],
};
beforeEach(() => { vi.clearAllMocks(); studentCardsApi.get.mockResolvedValue(data); });
const show = () => render(<MemoryRouter initialEntries={["/student-cards?student=42"]}><StudentCards /></MemoryRouter>);

it("shows current class, guardian phone, QR and the inclusive last valid date", async () => {
  show();
  expect(await screen.findByText("Class 9 / A")).toBeInTheDocument();
  expect(screen.getByText("03001234567")).toBeInTheDocument();
  expect(screen.getByText("Valid through 29 Oct 2027")).toBeInTheDocument();
  expect(await screen.findByAltText("Student attendance QR code")).toBeInTheDocument();
  expect(screen.getByAltText("Insights Academy logo")).toHaveAttribute("src", "/branding/insights-mark.svg");
});

it("replaces a lost card after confirmation and renders the new class and QR", async () => {
  studentCardsApi.action.mockResolvedValue({ ...data, card: { ...data.card, version: 2, token: "AMS1_replacement", className: "Class 10" } });
  show();fireEvent.click(await screen.findByRole("button", { name: "Replace card" }));
  expect(studentCardsApi.action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  expect(await screen.findByText("Class 10 / A")).toBeInTheDocument();
  expect(studentCardsApi.action).toHaveBeenCalledWith("42", "replace");
});

it("edits the shared student details without issuing a different card", async () => {
  studentsApi.update.mockResolvedValue({});
  show();fireEvent.click(await screen.findByRole("button", { name: "Edit card details" }));
  fireEvent.change(screen.getByLabelText(/Student name/), { target: { value: "Ahmed Khan" } });
  fireEvent.click(screen.getByRole("button", { name: "Save card details" }));
  await waitFor(() => expect(studentsApi.update).toHaveBeenCalledWith("42", { fullName: "Ahmed Khan", photoUrl: "", guardian: { primaryPhone: "03001234567" } }));
  expect(studentCardsApi.action).not.toHaveBeenCalled();
});
