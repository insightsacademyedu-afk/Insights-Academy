import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import AttendanceScanner from "./AttendanceScanner";
import { attendanceApi } from "../api/attendance";

vi.mock("../api/attendance", () => ({ attendanceApi: { scan: vi.fn() } }));
const { decodeFromConstraints } = vi.hoisted(() => ({ decodeFromConstraints: vi.fn() }));
vi.mock("@zxing/browser", () => ({ BrowserQRCodeReader: class { decodeFromConstraints(...args) { return decodeFromConstraints(...args); } } }));
beforeEach(() => vi.clearAllMocks());

const saved = { message: "Attendance saved", duplicate: false, student: { fullName: "Amina Ali", admissionNumber: "0042" }, record: { className: "Class 9", sectionName: "A", checkedInAt: "2026-10-30T03:12:00Z" } };

it("submits a USB scanner token and reports confirmed attendance in Pakistan time", async () => {
  attendanceApi.scan.mockResolvedValue(saved);
  const onSaved = vi.fn();
  render(<AttendanceScanner onSaved={onSaved} />);
  fireEvent.change(screen.getByLabelText("USB scanner or QR token"), { target: { value: "AMS1_token" } });
  fireEvent.click(screen.getByRole("button", { name: "Mark attendance" }));
  expect(await screen.findByText("Attendance saved")).toBeInTheDocument();
  expect(attendanceApi.scan).toHaveBeenCalledWith("AMS1_token");
  expect(screen.getByText(/Class 9 \/ A/).textContent).toMatch(/08:12.*PKT/);
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it("reports duplicates and shows a failure without claiming attendance was saved", async () => {
  attendanceApi.scan.mockResolvedValueOnce({ ...saved, message: "Already marked today", duplicate: true }).mockRejectedValueOnce({ message: "Card expired; renew it before checking in" });
  const onSaved = vi.fn();
  render(<AttendanceScanner onSaved={onSaved} />);
  const input = screen.getByLabelText("USB scanner or QR token");
  fireEvent.change(input, { target: { value: "AMS1_first" } });fireEvent.click(screen.getByRole("button", { name: "Mark attendance" }));
  expect(await screen.findByText("Already marked today")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "AMS1_expired" } });fireEvent.click(screen.getByRole("button", { name: "Mark attendance" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Card expired");
  expect(screen.queryByText("Attendance saved")).not.toBeInTheDocument();
  expect(onSaved).toHaveBeenCalledTimes(1);
});

it("handles unavailable camera access and keeps the USB input available", async () => {
  render(<AttendanceScanner />);
  fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Camera access requires HTTPS"));
  expect(screen.getByLabelText("USB scanner or QR token")).toBeInTheDocument();
});

it("decodes camera results once during the cooldown and stops the camera on unmount", async () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
  const stop = vi.fn();
  decodeFromConstraints.mockResolvedValue({ stop });
  attendanceApi.scan.mockResolvedValue(saved);
  const view = render(<AttendanceScanner />);
  try {
    fireEvent.click(screen.getByRole("button", { name: "Start camera" }));
    await waitFor(() => expect(decodeFromConstraints).toHaveBeenCalledTimes(1));
    const callback = decodeFromConstraints.mock.calls[0][2];
    callback({ getText: () => "AMS1_camera" });
    expect(await screen.findByText("Attendance saved")).toBeInTheDocument();
    callback({ getText: () => "AMS1_camera" });
    expect(attendanceApi.scan).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(stop).toHaveBeenCalled();
  } finally {
    view.unmount();
    if (original) Object.defineProperty(navigator, "mediaDevices", original);
    else delete navigator.mediaDevices;
  }
});

it("shows a teacher response from the shared scanner without student-only fields", async () => {
  attendanceApi.scan.mockResolvedValue({ message: "Teacher attendance saved", teacher: { fullName: "Ayesha Khan" }, employeeId: "EMP-42", record: { designation: "Teacher", checkedInAt: "2026-10-30T03:12:00Z" } });
  render(<AttendanceScanner />);
  fireEvent.change(screen.getByLabelText("USB scanner or QR token"), { target: { value: "AMT1_token" } });
  fireEvent.click(screen.getByRole("button", { name: "Mark attendance" }));
  expect(await screen.findByText("Teacher attendance saved")).toBeInTheDocument();
  expect(screen.getByText(/Ayesha Khan.*EMP-42/)).toBeInTheDocument();
});
