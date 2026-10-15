import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SubAdmins from "./SubAdmins";

vi.mock("../components/AppLayout", () => ({ default: ({ children }) => <main>{children}</main> }));
vi.mock("../context/ToastContext", () => ({ useToast: () => ({ success: vi.fn() }) }));
vi.mock("../api/subAdmins", () => ({ subAdminsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() } }));
import { subAdminsApi } from "../api/subAdmins";

beforeEach(() => {
  vi.clearAllMocks();
  subAdminsApi.list.mockResolvedValue({ items: [] });
  subAdminsApi.create.mockResolvedValue({});
  subAdminsApi.update.mockResolvedValue({});
});

test("admin creates a sub-admin with separate login credentials", async () => {
  const user = userEvent.setup();
  render(<SubAdmins />);
  await user.click(screen.getByRole("button", { name: "New sub-admin" }));
  await user.type(screen.getByLabelText(/Name/), "Student Office");
  await user.type(screen.getByLabelText(/Username/), "reception");
  await user.type(screen.getByLabelText(/Email/), "office@example.com");
  await user.type(screen.getByLabelText(/^Password/, { selector: "input" }), "OfficePassword123!");
  await user.click(screen.getByRole("button", { name: "Save sub-admin" }));
  await waitFor(() => expect(subAdminsApi.create).toHaveBeenCalledWith({ displayName: "Student Office", username: "reception", email: "office@example.com", password: "OfficePassword123!", status: "active" }));
  await waitFor(() => expect(screen.queryByLabelText(/^Password/, { selector: "input" })).not.toBeInTheDocument());
});

test("admin can deactivate an account without changing its password", async () => {
  subAdminsApi.list.mockResolvedValue({ items: [{ _id: "sub1", username: "reception", displayName: "Student Office", email: "office@example.com", status: "active" }] });
  const user = userEvent.setup();
  render(<SubAdmins />);
  await user.click(await screen.findByRole("button", { name: "Manage account" }));
  await user.selectOptions(screen.getByLabelText("Status"), "inactive");
  await user.click(screen.getByRole("button", { name: "Save sub-admin" }));
  await waitFor(() => expect(subAdminsApi.update).toHaveBeenCalledWith("sub1", expect.objectContaining({ status: "inactive", password: "" })));
});
