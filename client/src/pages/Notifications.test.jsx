import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Notifications from "./Notifications";
import { notificationsApi } from "../api/notifications";
import { NAV_SECTIONS, canAccessNav } from "../lib/nav";

let role = "admin";
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { role, username: "Test User" } }) }));
vi.mock("../context/ToastContext", () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock("../api/notifications", () => ({ notificationsApi: { list: vi.fn(), send: vi.fn(), markRead: vi.fn() } }));
const mount = () => render(<MemoryRouter><Notifications /></MemoryRouter>);
beforeEach(() => {
  role = "admin"; vi.resetAllMocks();
  notificationsApi.list.mockResolvedValue({ items: [], total: 0, totalPages: 1, unreadCount: 0 });
  notificationsApi.send.mockImplementation(body => Promise.resolve({ recipientCount: 2, recipientType: body.recipientType }));
  notificationsApi.markRead.mockResolvedValue({});
});

for (const recipientType of ["guardian", "staff"]) test(`admin shares a portal announcement with ${recipientType}`, async () => {
  mount(); const user = userEvent.setup();
  expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Guardian", "Staff"]);
  await user.selectOptions(screen.getByLabelText("Send to"), recipientType);
  await user.type(screen.getByLabelText(/Title/), "Notice");
  await user.type(screen.getByLabelText(/Message/), "Welcome to the academy.");
  await user.click(screen.getByRole("button", { name: "Share notification" }));
  await waitFor(() => expect(notificationsApi.send).toHaveBeenCalledWith({ title: "Notice", message: "Welcome to the academy.", recipientType }));
  expect(await screen.findByText(`Shared with 2 ${recipientType} portal account(s).`)).toBeInTheDocument();
  expect(screen.getByLabelText(/Title/)).toHaveValue("");
  expect(screen.queryByText(/email|queued|provider/i)).not.toBeInTheDocument();
});

for (const accountRole of ["guardian", "staff"]) test(`${accountRole} reads only their inbox and can mark a message as read`, async () => {
  role = accountRole;
  notificationsApi.list.mockResolvedValueOnce({ items: [{ _id: "n1", title: "Holiday", message: "Closed tomorrow", createdAt: "2026-10-15T10:00:00Z", read: false }], total: 1, totalPages: 1, unreadCount: 1 });
  mount(); const user = userEvent.setup();
  expect(await screen.findByText("Closed tomorrow")).toBeInTheDocument();
  expect(screen.queryByLabelText("Send to")).not.toBeInTheDocument();
  expect(notificationsApi.list).toHaveBeenCalledWith(1);
  await user.click(screen.getByRole("button", { name: "Mark as read" }));
  expect(notificationsApi.markRead).toHaveBeenCalledWith("n1");
  expect(await screen.findByText("No notifications yet.")).toBeInTheDocument();
});

test("failed sends preserve title and message", async () => {
  notificationsApi.send.mockRejectedValue(new Error("No active staff portal accounts are available."));
  mount(); const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Title/), "Notice");
  await user.type(screen.getByLabelText(/Message/), "Welcome");
  await user.click(screen.getByRole("button", { name: "Share notification" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No active staff");
  expect(screen.getByLabelText(/Message/)).toHaveValue("Welcome");
});

test("staff see Notifications in the navigation", () => {
  const item = NAV_SECTIONS.flatMap(section => section.items).find(item => item.to === "/notifications");
  expect(canAccessNav(item, "staff")).toBe(true);
  expect(canAccessNav(item, "guardian")).toBe(true);
  expect(canAccessNav(item, "subadmin")).toBe(false);
});
