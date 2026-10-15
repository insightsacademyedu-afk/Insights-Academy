import { beforeEach, expect, test, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Notifications from "./Notifications";
import { notificationsApi } from "../api/notifications";

let role = "admin";
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { role, username: "Test User" } }) }));
vi.mock("../context/ToastContext", () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock("../api/notifications", () => ({ notificationsApi: { list: vi.fn(), recipients: vi.fn(), send: vi.fn(), markRead: vi.fn(), processQueue: vi.fn() } }));
const mount = () => render(<MemoryRouter><Notifications /></MemoryRouter>);
beforeEach(() => {
  role = "admin"; vi.resetAllMocks();
  notificationsApi.list.mockResolvedValue({ items: [], total: 0, totalPages: 1, unreadCount: 0 });
  notificationsApi.recipients.mockResolvedValue({ items: [{ _id: "parent-1", displayName: "Parent One", phone: "03001234567" }], total: 11, totalPages: 2 });
  notificationsApi.send.mockResolvedValue({ recipientCount: 1, emailQueued: 1, emailSkipped: 0 });
  notificationsApi.markRead.mockResolvedValue({});
  notificationsApi.processQueue.mockResolvedValue({ hasQueuedEmails: false });
});

test("admin sends to a selected guardian, sees queue status, and pagination never submits the form", async () => {
  mount(); const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox"));
  await user.type(screen.getByLabelText(/Title/), "Holiday");
  await user.type(screen.getByLabelText(/Message/), "Academy closed tomorrow.");
  await user.click(screen.getByRole("button", { name: "Next page" }));
  expect(notificationsApi.send).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Send notification" }));
  await waitFor(() => expect(notificationsApi.send).toHaveBeenCalledWith({ title: "Holiday", message: "Academy closed tomorrow.", audience: "selected", guardianIds: ["parent-1"], studentIds: [] }));
  expect(await screen.findByText(/1 email\(s\) queued/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Title/)).toHaveValue("");
});

test("broadcast does not carry hidden selections and email configuration failures stay visible", async () => {
  notificationsApi.send.mockResolvedValue({ recipientCount: 2, emailQueued: 0, emailSkipped: 1, emailUnavailable: true });
  mount(); const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox"));
  await user.selectOptions(screen.getByLabelText("Send to"), "all");
  await user.type(screen.getByLabelText(/Title/), "Notice");
  await user.type(screen.getByLabelText(/Message/), "Welcome");
  await user.click(screen.getByRole("button", { name: "Send to all guardians" }));
  await waitFor(() => expect(notificationsApi.send).toHaveBeenCalledWith(expect.objectContaining({ audience: "all", guardianIds: [], studentIds: [] })));
  expect(await screen.findByText(/Email service is not configured/)).toBeInTheDocument();
});

test("guardian inbox supports marking read and never displays the sending form", async () => {
  role = "guardian";
  notificationsApi.list.mockResolvedValueOnce({ items: [{ _id: "n1", title: "Holiday", message: "Closed tomorrow", createdAt: "2026-10-15T10:00:00Z", read: false }], total: 1, totalPages: 1, unreadCount: 1 });
  mount(); const user = userEvent.setup();
  expect(await screen.findByText("Closed tomorrow")).toBeInTheDocument();
  expect(screen.queryByLabelText("Send to")).not.toBeInTheDocument();
  expect(notificationsApi.list).toHaveBeenCalledWith(true, 1);
  await user.click(screen.getByRole("button", { name: "Mark as read" }));
  expect(notificationsApi.markRead).toHaveBeenCalledWith("n1");
  expect(await screen.findByText("No notifications yet.")).toBeInTheDocument();
});

test("a failed send preserves the message for correction", async () => {
  notificationsApi.send.mockRejectedValue(new Error("Guardian unavailable"));
  mount(); const user = userEvent.setup();
  await user.click(await screen.findByRole("checkbox"));
  await user.type(screen.getByLabelText(/Title/), "Notice");
  await user.type(screen.getByLabelText(/Message/), "Welcome");
  await user.click(screen.getByRole("button", { name: "Send notification" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Guardian unavailable");
  expect(screen.getByLabelText(/Message/)).toHaveValue("Welcome");
});

test("admin history displays the provider failure reason", async () => {
  notificationsApi.list.mockResolvedValue({ items: [{ _id: "failed", title: "Notice", message: "Welcome", createdAt: "2026-10-15T10:00:00Z", recipientCount: 1, audience: "selected", email: { sent: 0, pending: 0, failed: 1, skipped: 0, failures: ["Resend's test sender can only email the Resend account owner. Verify your academy domain in Resend."] } }], total: 1, totalPages: 1 });
  mount();
  expect(await screen.findByText(/Verify your academy domain in Resend/)).toBeInTheDocument();
});

test("admin can drain pending emails from the page without relying on a background worker", async () => {
  notificationsApi.list.mockResolvedValueOnce({ items: [], total: 0, totalPages: 1, hasQueuedEmails: true });
  mount(); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Process queued emails" }));
  expect(notificationsApi.processQueue).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Process queued emails" })).not.toBeInTheDocument());
});

test("an open admin page automatically processes queued emails through active requests", async () => {
  vi.useFakeTimers();
  try {
    notificationsApi.list.mockResolvedValueOnce({ items: [], total: 0, totalPages: 1, hasQueuedEmails: true });
    await act(async () => { mount(); });
    expect(notificationsApi.processQueue).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(notificationsApi.processQueue).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(notificationsApi.processQueue).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
