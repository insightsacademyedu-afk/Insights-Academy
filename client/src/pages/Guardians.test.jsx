import { vi, test, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Guardians from "./Guardians";
import { guardiansApi } from "../api/guardians";
import { studentsApi } from "../api/students";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: { username: "admin", role: "admin" }, isAdmin: true }) }));
vi.mock("../context/ToastContext", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("../api/guardians", () => ({ guardiansApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), resetPassword: vi.fn(), revokeLogin: vi.fn() } }));
vi.mock("../api/students", () => ({ studentsApi: { list: vi.fn() } }));
const children = [
  { _id: "child-1", fullName: "Child One", admissionNumber: "0001", guardian: { fullName: "Parent One", primaryPhone: "03001234567" } },
  { _id: "child-2", fullName: "Child Two", admissionNumber: "0002" },
];
const account = { _id: "parent-1", displayName: "Parent One", phone: "923001234567", status: "active", studentIds: [children[0]] };
const mount = () => render(<MemoryRouter><Guardians /></MemoryRouter>);
beforeEach(() => {
  vi.resetAllMocks();
  guardiansApi.list.mockResolvedValue({ items: [], total: 0, totalPages: 1 });
  studentsApi.list.mockResolvedValue({ items: children });
  guardiansApi.create.mockResolvedValue({}); guardiansApi.resetPassword.mockResolvedValue({});
});

test("admin creates a phone-only guardian account with explicitly selected siblings", async () => {
  mount(); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "New guardian login" }));
  await user.click(await screen.findByRole("checkbox", { name: /Child One/ }));
  await user.click(screen.getByRole("checkbox", { name: /Child Two/ }));
  expect(screen.getByLabelText(/^Guardian name/)).toHaveValue("Parent One");
  await user.type(screen.getByLabelText(/^Initial password/), "ParentInitial123!");
  await user.click(screen.getByRole("button", { name: "Create guardian login" }));
  await waitFor(() => expect(guardiansApi.create).toHaveBeenCalledWith(expect.objectContaining({
    displayName: "Parent One", email: "", phone: "03001234567", password: "ParentInitial123!", studentIds: ["child-1", "child-2"],
  })));
});

test("contact details alone do not allow creating an account without selecting a child", async () => {
  mount(); const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "New guardian login" }));
  await user.type(screen.getByLabelText(/^Guardian name/), "Parent One");
  await user.type(screen.getByLabelText(/^Login phone/), "03001234567");
  await user.type(screen.getByLabelText(/^Initial password/), "ParentInitial123!");
  await user.click(screen.getByRole("button", { name: "Create guardian login" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Select at least one child");
  expect(guardiansApi.create).not.toHaveBeenCalled();
});

test("administrator resets a guardian password after confirming it", async () => {
  guardiansApi.list.mockResolvedValue({ items: [account], total: 1, totalPages: 1 });
  mount(); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Reset password for Parent One" }));
  await user.type(screen.getByLabelText(/^New guardian password/), "NewParentPassword123!");
  await user.type(screen.getByLabelText(/^Confirm guardian password/), "NewParentPassword123!");
  await user.click(screen.getByRole("button", { name: "Reset guardian password" }));
  await waitFor(() => expect(guardiansApi.resetPassword).toHaveBeenCalledWith("parent-1", "NewParentPassword123!"));
});

test("editing guardian access retains the existing child and saves added siblings", async () => {
  guardiansApi.list.mockResolvedValue({ items: [account], total: 1, totalPages: 1 });
  guardiansApi.update.mockResolvedValue({});
  mount(); const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Edit Parent One" }));
  expect(await screen.findByRole("checkbox", { name: /Child One/ })).toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: /Child Two/ }));
  await user.click(screen.getByRole("button", { name: "Save guardian access" }));
  await waitFor(() => expect(guardiansApi.update).toHaveBeenCalledWith("parent-1", expect.objectContaining({ studentIds: ["child-1", "child-2"] })));
});
