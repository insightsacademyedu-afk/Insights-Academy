import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Notifications from "./Notifications";
import { notificationsApi } from "../api/notifications";

let role = "admin";
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { role, username: "Test User" } }) }));
vi.mock("../context/ToastContext", () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock("../api/notifications", () => ({ notificationsApi: { list: vi.fn(), recipients: vi.fn(), send: vi.fn(), markRead: vi.fn() } }));
const mount = () => render(<MemoryRouter><Notifications /></MemoryRouter>);
beforeEach(() => {
  role = "admin"; vi.resetAllMocks();
  notificationsApi.list.mockResolvedValue({ items: [], total: 0, totalPages: 1, unreadCount: 0 });
  notificationsApi.recipients.mockResolvedValue({ items: [{ _id: "parent-1", displayName: "Parent One", phone: "03001234567" }], total: 11, totalPages: 2 });
  notificationsApi.send.mockResolvedValue({ recipientCount: 1, emailQueued: 1, emailSkipped: 0 });
  notificationsApi.markRead.mockResolvedValue({});
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
